import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Standalone std-only Rust. This deliberately never invokes maintained Iroha or
// Cargo. Tests the public hazard graph API against independent lattice scans.
const output = 'output/qualification/street-hazards';
const paths = ['world/native/street_graph.rs', 'world/native/street_geometry.rs',
  'world/native/street_hazards.rs', 'scripts/test-street-hazards.ts'];
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const sources = Object.fromEntries(await Promise.all(paths.map(async p => [p, hash(await readFile(p))])));
await mkdir(output, { recursive: true });
const modules = ['graph', 'geometry', 'hazards'].map(n =>
  `#[allow(dead_code)] #[path=${JSON.stringify(resolve(`world/native/street_${n}.rs`))}] mod ${n};`).join('\n');
const oracle = String.raw`
use graph::{Graph,Value};
use geometry::{StreetGeometry,Topology};
use hazards::{Catalog,Hazard,Kind,HazardMotion,HazardResolution,SUBTICKS};
use std::time::Instant;

type Actor = [i64;8];
fn object(kind:Kind,p:i64,x:i64)->Hazard {
    Hazard { kind,progress_mm:p,lateral_mm:x,
        half_length_mm:if kind==Kind::Oil {6000} else {250},
        half_width_mm:if kind==Kind::Oil {500} else {200} }
}
fn build(c:&Catalog,n:usize)->(Graph,HazardResolution,Vec<Value>) {
    let mut g=Graph::new(); let mask=g.input("mask",0,65535);
    let mut motion=Vec::new(); let mut oil=Vec::new();
    for i in 0..n {
        let m=HazardMotion {progress:g.input(&format!("p{i}"),-12000,80006000),
            lateral:g.input(&format!("x{i}"),-16000,16000),
            delta_progress:g.input(&format!("ds{i}"),-6000,6000),
            delta_lateral:g.input(&format!("dx{i}"),-32000,32000),
            resolved_progress:g.input(&format!("q{i}"),-12000,80006000),
            resolved_lateral:g.input(&format!("y{i}"),-16000,16000),
            active:g.input(&format!("a{i}"),0,1),speed:g.input(&format!("v{i}"),0,3000)};
        oil.push(hazards::oil_at_start(&mut g,c,m.progress,m.lateral,m.active)); motion.push(m);
    }
    let r=hazards::append(&mut g,c,&motion,mask); (g,r,oil)
}
fn eval(g:&Graph,geo:&StreetGeometry<'_>,mask:i64,actors:&[Actor])->Result<Vec<i64>,&'static str> {
    let mut input=vec![mask]; for a in actors {input.extend(a);} g.evaluate(&input,geo)
}
fn actor(p:i64,x:i64,ds:i64,dx:i64,stop_s:i64,stop_x:i64)->Actor {
    [p,x,ds,dx,p+ds*stop_s/SUBTICKS,x+dx*stop_x/SUBTICKS,1,2400]
}
fn contains(c:&Catalog,h:Hazard,p:i64,x:i64)->bool {
    // Independent direct world-coordinate membership at each sampled pose;
    // do not share the production nearest-image or slab-window formulation.
    let mut d=(p-h.progress_mm).abs();
    if c.circuit() { d%=c.length_mm(); d=d.min(c.length_mm()-d); }
    d<=h.half_length_mm+1800 && (x-h.lateral_mm).abs()<=h.half_width_mm+900
}
fn scan(c:&Catalog,h:Hazard,a:Actor,stop_s:i64,stop_x:i64)->(bool,bool,bool) {
    let mut hit=false; let mut start=false; let mut end=false;
    for u in 0..=SUBTICKS {
        // Explicit independently stopped clocks, not endpoint capping or a
        // segment between endpoints. Every integer subtick is visited.
        let p=a[0]+a[2]*u.min(stop_s)/SUBTICKS;
        let x=a[1]+a[3]*u.min(stop_x)/SUBTICKS;
        let inside=contains(c,h,p,x) && a[6]==1;
        hit|=inside; if u==0 {start=inside;} if u==SUBTICKS {end=inside;}
    }
    (hit,start,end)
}
fn next(seed:&mut u64,n:i64)->i64 {
    *seed=seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    (*seed>>32) as i64%n
}
fn full_lattice(geo:&StreetGeometry<'_>)->(usize,usize) {
    let mut seed=0x1986_acdc_8432_7234; let mut cases=0; let mut hits=0;
    for kind in [Kind::Oil,Kind::BreakawaySign,Kind::TreePlanter] {
      for circuit in [false,true] {
        let h=object(kind,50000,-500);
        let c=Catalog::new(500000,circuit,vec![h]).unwrap(); let (g,r,oil)=build(&c,2);
        for index in 0..384 {
            let p=if circuit {500000*(index%16)} else {0}+38000+next(&mut seed,24001);
            let x=next(&mut seed,24001)-12000;
            let ds=next(&mut seed,12001)-6000;
            let dx=next(&mut seed,16001)-8000;
            let stop_s=next(&mut seed,SUBTICKS+1); let stop_x=next(&mut seed,SUBTICKS+1);
            let mut a=actor(p,x,ds,dx,stop_s,stop_x);
            // Keep the input's free endpoint within its documented domain.
            a[3]=a[3].clamp(-16000-x,16000-x); a[5]=x+a[3]*stop_x/SUBTICKS;
            let far=actor(100000,15000,0,0,0,0);
            let (hit,start,end)=scan(&c,h,a,stop_s,stop_x);
            let v=eval(&g,geo,0,&[a,far]).unwrap(); hits+=usize::from(hit); cases+=1;
            assert_eq!(v[r.contact_masks[0].index],i64::from(hit),"{kind:?}/{circuit}/{index}: {a:?}");
            if kind==Kind::Oil {
                assert_eq!(v[oil[0].index],i64::from(start));
                assert_eq!(v[r.oil_contact[0].index],i64::from(hit));
                assert_eq!(v[r.oil_entered[0].index],i64::from(hit&&!start));
                assert_eq!(v[r.oil_exited[0].index],i64::from(hit&&!end));
                assert_eq!(v[r.broken_mask.index],0); assert_eq!(v[r.speed[0].index],2400);
            } else {
                assert_eq!(v[oil[0].index],0); assert_eq!(v[r.prop_hit_masks[0].index],i64::from(hit));
                assert_eq!(v[r.broken_mask.index],i64::from(hit));
                assert_eq!(v[r.speed[0].index],if hit {2400*kind.retained_speed_q256()/256} else {2400});
                let old=eval(&g,geo,1,&[a,far]).unwrap();
                assert_eq!(old[r.prop_hit_masks[0].index],0); assert_eq!(old[r.speed[0].index],2400);
                assert_eq!(old[r.broken_mask.index],1);
            }
        }
      }
    }
    assert!(hits>100); (cases,hits)
}

struct AxisCase {delta:i64,stop:i64,end:i64,changes:Vec<(i64,i64)>}
fn axis_cases()->Vec<AxisCase> {
    let mut all=Vec::new();
    for delta in -3_i64..=3 {
      for stop in [0,1,SUBTICKS/3,SUBTICKS/2,SUBTICKS-1,SUBTICKS] {
        let mut changes=Vec::new(); let mut previous=i64::MAX;
        // Compress only after independently enumerating EVERY subtick. The
        // union of these exact change points covers every 2D lattice pose.
        for u in 0..=SUBTICKS {
            let value=delta*u.min(stop)/SUBTICKS;
            if value!=previous {changes.push((u,value));previous=value;}
        }
        all.push(AxisCase {delta,stop,end:delta*stop/SUBTICKS,changes});
      }
    }
    all
}
fn reduced_exhaustive(geo:&StreetGeometry<'_>)->usize {
    let h=object(Kind::BreakawaySign,50000,0); let c=Catalog::new(500000,false,vec![h]).unwrap();
    let (g,r,_)=build(&c,2); let all=axis_cases(); let mut cases=0;
    let far=actor(100000,15000,0,0,0,0);
    for s in &all { for x in &all {
        let mut ticks=vec![0,SUBTICKS]; ticks.extend(s.changes.iter().map(|p|p.0));
        ticks.extend(x.changes.iter().map(|p|p.0)); ticks.sort_unstable(); ticks.dedup();
        for ds in [-2052,-2051,-2050,-2049,0,2049,2050,2051,2052] {
          for dx in [-1102,-1101,-1100,-1099,0,1099,1100,1101,1102] {
            let a=[50000+ds,dx,s.delta,x.delta,50000+ds+s.end,dx+x.end,1,2400];
            let hit=ticks.iter().any(|&u|contains(&c,h,a[0]+s.delta*u.min(s.stop)/SUBTICKS,
                a[1]+x.delta*u.min(x.stop)/SUBTICKS));
            let v=eval(&g,geo,0,&[a,far]).unwrap();
            assert_eq!(v[r.contact_masks[0].index],i64::from(hit),"boundary {a:?}, stops {},{}",s.stop,x.stop);
            cases+=1;
          }
        }
    }}
    cases
}

fn masks(geo:&StreetGeometry<'_>)->usize {
    let objects=vec![object(Kind::Oil,50000,0),object(Kind::BreakawaySign,50000,0),
      object(Kind::TreePlanter,51500,0),object(Kind::BreakawaySign,53000,0)];
    let c=Catalog::new(500000,true,objects).unwrap(); let (g,r,oil)=build(&c,8); let mut cases=0;
    for mask in 0..16 {
      for rotation in 0..8 {
        let actors=(0..8).map(|i| {
            let k=(i+rotation)%8;
            let mut a=actor(46000+(k/2)*500,if k%2==0 {-900} else {900},6000,0,SUBTICKS,SUBTICKS);
            a[7]=3000-k*301;
            if k==7 {a[2]=0;a[4]=a[0];a[6]=0;}
            a
        }).collect::<Vec<_>>();
        let result=eval(&g,geo,mask,&actors); cases+=1;
        if mask&1!=0 {assert!(result.is_err(),"oil broken bit must reject");continue;}
        let v=result.unwrap(); let mut expected_mask=mask;
        for (i,a) in actors.iter().enumerate() {
            let mut expected_speed=a[7]; let mut hit_bits=0; let mut prop_bits=0;
            for (index,&h) in c.objects().iter().enumerate() {
                let bit=1<<index;
                // Independently walk this short straight path in millimeters;
                // delta<=6000 ensures every integer position is visited by the
                // subtick clock, so this is exact for these fixed trajectories.
                let hit=a[6]==1 && mask&bit==0 && (0..=6000).any(|ds|contains(&c,h,a[0]+ds,a[1]));
                if hit {hit_bits|=bit;
                    if h.kind!=Kind::Oil {prop_bits|=bit;expected_mask|=bit;
                        expected_speed=expected_speed*h.kind.retained_speed_q256()/256;}
                }
            }
            assert_eq!(v[r.contact_masks[i].index],hit_bits);
            assert_eq!(v[r.prop_hit_masks[i].index],prop_bits);
            assert_eq!(v[r.speed[i].index],expected_speed);
            assert_eq!(v[oil[i].index],a[6]);
        }
        assert_eq!(v[r.broken_mask.index],expected_mask);
        for index in 0..4 {
            let expected=actors.iter().enumerate().any(|(i,_)|v[r.contact_masks[i].index]&(1<<index)!=0);
            assert_eq!(v[r.object_hits[index].index],i64::from(expected));
        }
      }
    }
    let idle=vec![actor(100000,0,0,0,0,0);8];
    for invalid in [-1,16,65535,65536] {assert!(eval(&g,geo,invalid,&idle).is_err()); cases+=1;}
    // A caller cannot move an inactive car, reverse a resolved axis, overshoot
    // the free endpoint, or insert a non-Boolean active flag.
    for field in 0..5 {
        let mut actors=idle.clone(); let a=&mut actors[0];
        match field {0=>{a[6]=0;a[2]=1;},1=>{a[6]=0;a[4]+=1;},
          2=>{a[2]=100;a[4]-=1;},3=>{a[2]=100;a[4]+=101;},_=>a[6]=2}
        assert!(eval(&g,geo,0,&actors).is_err()); cases+=1;
    }
    // Cover bit 15 and all 16 valid mask bits without signed/bit-count aliasing.
    let objects=(0..16).map(|i|object(Kind::BreakawaySign,30000+i*25000,0)).collect();
    let wide=Catalog::new(500000,true,objects).unwrap(); let (g,r,_)=build(&wide,8);
    let actors=vec![actor(402000,0,6000,0,SUBTICKS,SUBTICKS);8];
    for old in [0,1,32767,32768,43690,65534,65535] {
        let v=eval(&g,geo,old,&actors).unwrap(); cases+=1;
        assert_eq!(v[r.broken_mask.index],old|32768);
        for i in 0..8 {
            assert_eq!(v[r.prop_hit_masks[i].index],if old&32768==0 {32768} else {0});
            assert_eq!(v[r.speed[i].index],if old&32768==0 {2100} else {2400});
        }
    }
    let mut objects=wide.objects().to_vec(); objects[15]=object(Kind::Oil,405000,0);
    let oily=Catalog::new(500000,true,objects).unwrap(); let (g,r,_)=build(&oily,8);
    let v=eval(&g,geo,32767,&actors).unwrap(); cases+=1;
    assert_eq!(v[r.broken_mask.index],32767);
    assert!(r.oil_contact.iter().all(|p|v[p.index]==1));
    assert!(eval(&g,geo,65535,&actors).is_err()); cases+=1;
    cases
}
fn budgets(geo:&StreetGeometry<'_>)->Vec<String> {
    let mut reports=Vec::new();
    for mode in 0..3 { for circuit in [false,true] {
        let objects=(0..16).map(|i| {
            let mut h=object(match mode {0=>Kind::Oil,1=>if i%2==0 {Kind::TreePlanter}else{Kind::BreakawaySign},
                _=>match i%3 {0=>Kind::Oil,1=>Kind::TreePlanter,_=>Kind::BreakawaySign}},40000+i*25000,-1500+i*199);
            // Distinct dimensions exercise constant interning less favorably
            // than 16 identical objects. These are maximum-cardinality costs,
            // not a formal maximum over every admissible authored catalog.
            h.half_length_mm=if h.kind==Kind::Oil {6000+i*837} else {250+i*71};
            h.half_width_mm=if h.kind==Kind::Oil {500+i*119} else {200+i*79}; h
        }).collect();
        let c=Catalog::new(500000,circuit,objects).unwrap(); let (g,r,_)=build(&c,8);
        let actors=(0..8).map(|i|actor(10000+i*5000,0,6000,0,SUBTICKS,SUBTICKS)).collect::<Vec<_>>();
        let mut timing=Vec::new(); let mut nodes=0;
        for _ in 0..256 {
            let start=Instant::now(); let v=eval(&g,geo,0,&actors).unwrap();
            timing.push(start.elapsed().as_nanos()); nodes=v.len();
            assert!(r.speed.iter().all(|p|v[p.index]<=2400)); std::hint::black_box(v);
        }
        timing.sort_unstable(); assert!(nodes<18000);
        let label=match mode {0=>"oil",1=>"props",_=>"mixed"};
        reports.push(format!("{{\"catalog\":\"{label}\",\"circuit\":{circuit},\"objects\":16,\"cars\":8,\"nodes\":{nodes},\"medianNs\":{},\"p95Ns\":{},\"samples\":256}}",timing[128],timing[243]));
    }} reports
}
fn main() {
    let rows=(0..=100).map(|i|[i*5000,0,i*5000,0,12000,0,0,0]).collect::<Vec<_>>();
    let geo=StreetGeometry::new(Topology::Sprint,500000,&rows).unwrap();
    let started=Instant::now(); let (full,hits)=full_lattice(&geo);
    let reduced=reduced_exhaustive(&geo); let masks=masks(&geo); let budgets=budgets(&geo);
    println!("{{\"fullLatticeCases\":{full},\"fullLatticeSubticksPerCase\":65537,\"fullLatticeContacts\":{hits},\"reducedDomainExhaustiveCases\":{reduced},\"sharedMaskCasesAndRejections\":{masks},\"budgets\":[{}],\"elapsedMs\":{}}}",budgets.join(","),started.elapsed().as_millis());
}
`;
await writeFile(`${output}/oracle.rs`, `${modules}\n${oracle}`);
const rustc = execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim();
execFileSync('rustc', ['--edition=2024', '-Awarnings', '-O', '--test', `${output}/oracle.rs`, '-o', `${output}/module-tests`], { stdio: 'inherit' });
const moduleLog = execFileSync(`${output}/module-tests`, [], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
await writeFile(`${output}/module-tests.log`, moduleLog);
execFileSync('rustc', ['--edition=2024', '-Awarnings', '-O', `${output}/oracle.rs`, '-o', `${output}/oracle`], { stdio: 'inherit' });
const oracleLog = execFileSync(`${output}/oracle`, [], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const result = JSON.parse(oracleLog);
for (const [path, digest] of Object.entries(sources)) assert.equal(hash(await readFile(path)), digest, `source changed during test: ${path}`);
const artifacts = Object.fromEntries(await Promise.all(['oracle.rs', 'oracle', 'module-tests', 'module-tests.log'].map(async name => [name, hash(await readFile(`${output}/${name}`))])));
const report = { version: 1, scope: 'Native host graph interaction semantics only; no AIR, STARK, consensus, historical placement or complete-race qualification.',
  rustc, sources, artifacts, result,
  reducedDomain: 'Cartesian product: free axis deltas -3..3, independent stop clocks {0,1,21845,32768,65535,65536}, and nine starts at/around each expanded AABB boundary and center. Every subtick is enumerated per axis before exact change-point union.',
  qualification: { nativeHazardHostSemantics: true, browserParity: false, completeRace: false, proof: false, consensus: false } };
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.result, null, 2));
console.log(`Source-pinned native roadside evidence: ${output}/report.json`);
