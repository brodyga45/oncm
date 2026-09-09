//! ONCM adapter. Adds goal binding; does not change any kernel typing rule.
use crate::{env::{Declar,EnvLimit},expr::BinderStyle,util::ExportFile};
impl<'p> ExportFile<'p> {
    /// Only use native arithmetic shortcuts whose complete declarations are
    /// pinned in the profile foundation. Other operations still typecheck and
    /// reduce by their checked Lean definitions, without name-based shortcuts.
    pub fn configure_oncm_reduction(&mut self) {
        let c = &mut self.name_cache;
        c.nat_sub=None; c.nat_mul=None; c.nat_pow=None;
        c.nat_mod=None; c.nat_div=None; c.nat_beq=None; c.nat_ble=None;
        c.nat_gcd=None; c.nat_xor=None; c.nat_land=None; c.nat_lor=None;
        c.nat_shl=None; c.nat_shr=None; c.eager_reduce=None;
    }

    pub fn check_oncm_claim(&self,outcome:u8) {
        let find=|name:&str| self.dag.find_name(name)
            .and_then(|canonical|self.declars.get(&canonical))
            .unwrap_or_else(||panic!("missing canonical declaration {name}"));
        let (goal,goal_value)=match find("Oncm.goal") {
            Declar::Definition {info,val,..}=>(*info,*val),
            _=>panic!("Oncm.goal must be a definition, not an axiom or a theorem")
        };
        self.with_tc(EnvLimit::PpUnlimited,|tc| {
            assert!(tc.ctx.read_levels(goal.uparams).is_empty(),"goal must be closed");
            let prop=tc.ctx.mk_sort(tc.ctx.zero());
            tc.assert_def_eq(goal.ty,prop);
        });
        if outcome==0 { return; }
        assert!(outcome==1 || outcome==2);
        let solution=match find("Oncm.solution") {
            Declar::Theorem {info,..}=>*info,
            _=>panic!("solution must be a checked theorem")
        };
        self.with_tc(EnvLimit::PpUnlimited,|tc| {
            assert!(tc.ctx.read_levels(solution.uparams).is_empty(),"solution must be closed");
            let target=if outcome==1 {goal_value} else {
                let falsity=find("False").info();
                assert!(tc.ctx.read_levels(falsity.uparams).is_empty());
                let false_expr=tc.ctx.mk_const(falsity.name,falsity.uparams);
                tc.ctx.mk_pi(tc.ctx.anonymous(),BinderStyle::Default,goal_value,false_expr)
            };
            tc.assert_def_eq(solution.ty,target);
        });
    }
}
