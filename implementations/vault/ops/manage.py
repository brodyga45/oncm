#!/usr/bin/env python3
"""Install/control only the four org.oncm.vault user LaunchAgents."""
import argparse,json,os,pathlib,plistlib,re,signal,subprocess,tempfile,time
p=argparse.ArgumentParser();p.add_argument('action',choices=['install','start','stop','status']);p.add_argument('roles',nargs='*');a=p.parse_args()
if any(r not in ['chain','api','nginx','ngrok'] for r in a.roles):p.error('roles must be chain, api, nginx or ngrok')
root=pathlib.Path(__file__).resolve().parent.parent;state=root/'.state/pilot';agents=pathlib.Path.home()/'Library/LaunchAgents';roles=a.roles or ['chain','api','nginx','ngrok'];domain='gui/'+str(os.getuid())
def launch(*args):return subprocess.run(['/bin/launchctl',*args],capture_output=True,text=True)
for role in roles:
 label='org.oncm.vault.'+role;source=state/(label+'.plist');target=agents/source.name;service=domain+'/'+label
 if a.action=='install':
  d=plistlib.loads(source.read_bytes())
  if d.get('Label')!=label or d.get('ProgramArguments',[None,None])[1]!=str(root/'ops/service.mjs'):raise SystemExit('Unexpected service descriptor')
  agents.mkdir(parents=True,exist_ok=True)
  with tempfile.NamedTemporaryFile(dir=agents,prefix='.'+label,delete=False) as f:f.write(source.read_bytes());temporary=pathlib.Path(f.name)
  temporary.chmod(0o644);temporary.replace(target)
  print('Installed '+str(target));continue
 current=launch('print',service)
 if a.action=='status':
  lines=[line.strip() for line in current.stdout.splitlines() if line.strip().startswith(('state =','pid =','last exit code =','runs ='))]
  print(json.dumps({'service':label,'loaded':current.returncode==0,'status':lines}));continue
 if a.action=='start':
  if current.returncode==0:print(label+' already loaded; not restarting');continue
  result=launch('bootstrap',domain,str(target))
 else:
  if current.returncode!=0:print(label+' already stopped');continue
  # bootout may terminate descendants concurrently. First let our supervisor
  # signal Anvil with SIGINT and finish its final atomic checkpoint.
  match=re.search(r'^\s*pid = (\d+)\s*$',current.stdout,re.M)
  if match:
   pid=int(match.group(1))
   command=subprocess.run(['/bin/ps','-p',str(pid),'-o','command='],capture_output=True,text=True).stdout
   if str(root/'ops/service.mjs') not in command or not command.strip().endswith(' '+role):raise SystemExit('Unexpected service process; refusing signal')
   os.kill(pid,signal.SIGTERM)
   deadline=time.monotonic()+225
   while time.monotonic()<deadline:
    try:os.kill(pid,0)
    except ProcessLookupError:break
    time.sleep(.2)
   else:raise SystemExit('Service did not finish graceful stop; no forced kill or rollback was attempted')
  result=launch('bootout',service)
 if result.returncode:raise SystemExit(result.stderr or result.stdout)
 print(a.action+' '+label)
