#!/usr/bin/env python3
"""Render reviewable user LaunchAgents and nginx config. Does not install/start."""
import argparse,json,pathlib,plistlib,re,shutil,urllib.parse,os,ipaddress
p=argparse.ArgumentParser();p.add_argument('--origin',required=True);p.add_argument('--owner',required=True);a=p.parse_args()
u=urllib.parse.urlsplit(a.origin)
if u.scheme!='https' or not u.hostname or u.path or u.query or u.fragment or u.username or u.password: p.error('origin must be a bare HTTPS origin')
try:
 ipaddress.ip_address(u.hostname);p.error('origin must use a public hostname')
except ValueError: pass
if u.hostname=='localhost':p.error('origin must use a public hostname')
if not re.fullmatch(r'0x[0-9a-fA-F]{40}',a.owner): p.error('owner must be an EVM address')
root=pathlib.Path(__file__).resolve().parent.parent
state=root/'.state/pilot';state.mkdir(parents=True,exist_ok=True)
node=shutil.which('node');nginx=shutil.which('nginx');ngrok=shutil.which('ngrok')
if not node or not nginx or not ngrok: p.error('node22/23, nginx and ngrok required')
config={'origin':a.origin,'owner':a.owner.lower(),'nginx':nginx,'ngrok':ngrok,'chainId':31373,'mode':'persistent-local-public-pilot'}
def atomic_write(destination,data):
 temporary=destination.with_name(destination.name+'.tmp')
 with temporary.open('wb') as f:
  os.chmod(temporary,0o600);f.write(data);f.flush();os.fsync(f.fileno())
 os.replace(temporary,destination)
atomic_write(state/'config.json',(json.dumps(config,indent=2)+'\n').encode())
# Only these proxy routes can reach the API. RPC cannot bypass its allowlist.
conf='''worker_processes 1;
pid "STATE/nginx.pid";
error_log stderr warn;
events { worker_connections 128; }
http {
  include "MIMES";
  default_type application/octet-stream;
  server_tokens off;
  access_log off;
  client_max_body_size 1m;
  client_body_timeout 10s;
  send_timeout 20s;
  keepalive_timeout 15s;
  limit_req_zone $binary_remote_addr zone=pilot:1m rate=40r/s;
  limit_conn_zone $binary_remote_addr zone=connections:1m;
  client_body_temp_path "STATE/body";
  proxy_temp_path "STATE/proxy";
  server {
    listen 127.0.0.1:8080;
    listen 127.0.0.1:5173;
    server_name _;
    root "ROOT/dist";
    limit_conn connections 24;
    limit_req zone=pilot burst=120 nodelay;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy same-origin always;
    location = /rpc {
      proxy_pass http://127.0.0.1:4173;
      proxy_set_header Host "PUBLIC_HOST";
      proxy_set_header X-Forwarded-For $remote_addr;
      proxy_set_header X-Vault-Client-IP $remote_addr;
      proxy_read_timeout 20s;
    }
    location /api/ {
      proxy_pass http://127.0.0.1:4173;
      proxy_set_header Host "PUBLIC_HOST";
      proxy_set_header X-Forwarded-For $remote_addr;
      proxy_set_header X-Vault-Client-IP $remote_addr;
      proxy_read_timeout 20s;
    }
    location ~ /\\. { deny all; }
    location / { try_files $uri $uri/ /index.html; }
  }
}
'''
mimes=pathlib.Path(nginx).resolve().parent.parent/'conf/mime.types'
if not mimes.exists(): mimes=pathlib.Path('/opt/homebrew/etc/nginx/mime.types')
if not mimes.exists():p.error('nginx mime.types missing')
for value in [str(state),str(root),str(mimes),u.netloc]:
 if any(c in value for c in ['\"','\\','\n','\r']):p.error('unsupported nginx configuration path/host')
atomic_write(state/'nginx.conf',conf.replace('STATE',str(state)).replace('ROOT',str(root)).replace('MIMES',str(mimes)).replace('PUBLIC_HOST',u.netloc).encode())
for role in ['chain','api','nginx','ngrok']:
 label='org.oncm.vault.'+role
 d={'Label':label,'ProgramArguments':[node,str(root/'ops/service.mjs'),role], 'WorkingDirectory':str(root),'RunAtLoad':True,'KeepAlive':True,'ThrottleInterval':10,'ExitTimeOut':25,'AbandonProcessGroup':False,'ProcessType':'Background','StandardOutPath':'/dev/null','StandardErrorPath':'/dev/null','EnvironmentVariables':{'PATH':str(pathlib.Path(node).parent)+':/opt/homebrew/bin:/usr/bin:/bin','NODE_OPTIONS':'--max-old-space-size=512'}}
 atomic_write(state/(label+'.plist'),plistlib.dumps(d))
print(json.dumps({'prepared':str(state),'origin':a.origin,'owner':a.owner.lower(),'installed':False},indent=2))
