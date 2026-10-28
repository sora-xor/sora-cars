import os, sys, json, importlib
ROOT = os.path.abspath(os.environ.get('SORA_DRIVER_TOOLING', os.path.dirname(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bootstrap import services, MODULE
import bpy, addon_utils
from mathutils import Vector

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
H = services.HumanService
info = H._create_default_human_info_dict()
info['phenotype'].update(gender=1.0, age=.35, muscle=.42, weight=.42, height=.44,
                         race={'asian':1.0, 'caucasian':0.0, 'african':0.0})
info.update(name='GenericDriver', rig='default',
    eyes='high-poly/high-poly.mhclo', eyebrows='eyebrow001/eyebrow001.mhclo',
    eyelashes='eyelashes01/eyelashes01.mhclo', hair='short01/short01.mhclo',
    clothes=['male_casualsuit01/male_casualsuit01.mhclo','shoes01/shoes01.mhclo'],
    skin_mhmat='young_asian_male/young_asian_male.mhmat',
    skin_material_type='GAMEENGINE', eyes_material_type='GAMEENGINE')
settings = H.get_default_deserialization_settings()
settings.update(override_clothes_model='GAMEENGINE', override_eyes_model='GAMEENGINE')
body = H.deserialize_from_dict(info, settings)
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
addon_utils.enable('io_anim_bvh')
AnimationService = importlib.import_module(MODULE + '.services.animationservice').AnimationService
AnimationService.import_bvh_file_as_pose(rig, os.path.join(ROOT, 'assets/poses/anrico_sitting02/anrico_sitting02.bvh'))
bpy.context.view_layer.update()
out = os.path.join(ROOT, 'working')
os.makedirs(out, exist_ok=True)
def v(vec): return [round(x,6) for x in vec]
data = {'rig':rig.name, 'rig_matrix':[list(row) for row in rig.matrix_world], 'bones':{
 b.name:{'head':v(rig.matrix_world @ b.head), 'tail':v(rig.matrix_world @ b.tail),
 'rest_head':v(rig.matrix_world @ b.bone.head_local), 'rest_tail':v(rig.matrix_world @ b.bone.tail_local),
 'rotation':v(b.rotation_euler), 'parent':b.parent.name if b.parent else None}
 for b in rig.pose.bones}, 'objects':[{ 'name':o.name,'type':o.type, 'bounds':[v(o.matrix_world @ Vector(c)) for c in o.bound_box] if o.type=='MESH' else [],
 'vertices':len(o.data.vertices) if o.type=='MESH' else 0,
 'materials':[m.name for m in o.data.materials] if o.type=='MESH' else []} for o in bpy.data.objects]}
with open(os.path.join(out,'human-info.json'),'w') as f: json.dump(info,f,indent=2)
with open(os.path.join(out,'initial-inspection.json'),'w') as f: json.dump(data,f,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out,'driver-initial.blend'))
print('DRIVER_CREATED', rig.name, len(rig.pose.bones), len(bpy.data.objects))
