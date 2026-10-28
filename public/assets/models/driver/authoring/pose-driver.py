import bpy, os, math, json
from mathutils import Vector, Matrix, Quaternion
ROOT=os.path.abspath(os.environ.get('SORA_DRIVER_TOOLING', os.path.dirname(__file__)))
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'working/driver-initial.blend'))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
body=bpy.data.objects['GenericDriver.body']
def update(): bpy.context.view_layer.update()
def car(p): return Vector((p[0],-p[2],p[1]))
def record(p): return [round(p.x,6),round(p.z,6),round(-p.y,6)]
for b in rig.pose.bones:
 b.rotation_mode='QUATERNION'; b.rotation_quaternion=Quaternion();b.location=(0,0,0)
update()
standing_top=max((body.matrix_world@Vector(c)).z for c in body.bound_box)
scale=1.68/standing_top
rig.scale=(scale,scale,scale)
update()
hip=rig.matrix_world@rig.pose.bones['spine05'].head
rig.location+=car((-.3528,.424,.025))-hip
rig.pose.bones['spine05'].rotation_quaternion=Quaternion((1,0,0),math.radians(-27))
for name in ['neck01','neck02','neck03']:
 rig.pose.bones[name].rotation_quaternion=Quaternion((1,0,0),math.radians(5.0))
update()
def world_head(name):return rig.matrix_world@rig.pose.bones[name].head
def point(name, direction):
 b=rig.pose.bones[name]
 m=rig.matrix_world@b.matrix
 current=m.to_3x3().col[1].normalized()
 q=current.rotation_difference(Vector(direction).normalized())
 r=q.to_matrix()@m.to_3x3()
 out=r.to_4x4();out.translation=m.translation
 b.matrix=rig.matrix_world.inverted()@out
 update()
def length(names):return sum(rig.pose.bones[n].length*scale for n in names)
def chain(upper,lower,target,pole):
 start=world_head(upper[0]); delta=target-start
 a=length(upper);b=length(lower);d=delta.length
 if d>a+b-.001:print('UNREACHABLE',upper,d,a+b)
 axis=delta.normalized(); d=min(d,a+b-.0001)
 along=(a*a-b*b+d*d)/(2*d)
 sideways=(Vector(pole)-axis*Vector(pole).dot(axis)).normalized()
 elbow=start+axis*along+sideways*math.sqrt(max(0,a*a-along*along))
 for n in upper:point(n,elbow-start)
 for n in lower:point(n,target-elbow)
 return elbow
for side,sign in [('L',1),('R',-1)]:
 grip=car((-.36449+sign*.13423,.82493,.34855))
 # Palm extends past the wrist toward the upper rim; curl encloses the tube.
 wrist=grip+Vector((sign*.015,.100,-.025))
 chain(['upperarm01.'+side,'upperarm02.'+side],['lowerarm01.'+side,'lowerarm02.'+side],wrist,(sign*.25,.3,-1))
 point('wrist.'+side,grip-wrist)
 # Align palm plane to wheel. The finger flexion axis is local X after BVH roll setup.
 for b in rig.pose.bones:
  if b.name.endswith('.'+side) and b.name.startswith('finger'):
   b.rotation_quaternion=Quaternion((1,0,0),math.radians(62 if '1-' not in b.name else 32))
 update()
 for index, target in enumerate([(-.118,.835,.306),(-.102,.824,.339),(-.124,.809,.351)],1):
  name='finger1-'+str(index)+'.'+side
  destination=car((-.3528-sign*target[0],target[1],target[2]))
  point(name,destination-world_head(name))
 # Feet reach their own clutch/accelerator, with knees above the cushion.
 ankle=car((-.3528+sign*.10,.245,.665))
 chain(['upperleg01.'+side,'upperleg02.'+side],['lowerleg01.'+side,'lowerleg02.'+side],ankle,(sign*.07,-.1,1))
 point('foot.'+side,car((0,.015,.12)))
update()
data={'standingHeightMeters':1.68,'sourceStandingTop':standing_top,'scale':scale,'pelvis':record(world_head('spine05')),
 'bones':{n:{'head':record(world_head(n)),'tail':record(rig.matrix_world@b.tail)} for n,b in rig.pose.bones.items()},
 'bounds':{o.name:[record(o.matrix_world@Vector(c)) for c in o.bound_box] for o in bpy.data.objects if o.type=='MESH'}}
with open(os.path.join(ROOT,'working/seated-fit.json'),'w') as f:json.dump(data,f,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'working/driver-seated.blend'))
print('SEATED_DRIVER',json.dumps({k:v for k,v in data.items() if k not in ['bones','bounds']}))
