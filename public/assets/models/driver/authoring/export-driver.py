import bpy, os, sys, json, importlib
ROOT=os.path.abspath(os.environ.get('SORA_DRIVER_TOOLING', os.path.dirname(__file__)))
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from bootstrap import services, MODULE
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'working/driver-seated.blend'))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
body=bpy.data.objects['GenericDriver.body']
services.TargetService.bake_targets(body)
ExportService=importlib.import_module(MODULE+'.services.exportservice').ExportService
ExportService.bake_modifiers_remove_helpers(body,bake_masks=True,bake_subdiv=True,remove_helpers=True)
for o in list(bpy.data.objects):
 if o.type!='MESH':continue
 bpy.context.view_layer.objects.active=o
 for mod in list(o.modifiers):
  if mod.type=='SUBSURF':
   mod.levels=1 if 'casualsuit' in o.name or 'high-poly' in o.name else 0
   if mod.levels:bpy.ops.object.modifier_apply(modifier=mod.name)
   else:o.modifiers.remove(mod)
 # Preserve authored normal maps and alpha, with realistic dielectric response.
 for mat in o.data.materials:
  if not mat or not mat.use_nodes:continue
  for n in mat.node_tree.nodes:
   if n.type=='BSDF_PRINCIPLED':
    n.inputs['Metallic'].default_value=0
    n.inputs['Roughness'].default_value=.68 if 'short01' in o.name else .63 if o==body else .7
    if 'high-poly' in o.name:n.inputs['Roughness'].default_value=.24
    n.inputs['Emission Color'].default_value=(0,0,0,1)
    n.inputs['Emission Strength'].default_value=0
    if not any(key in o.name for key in ['short01','eyebrow','eyelashes']):
     for link in list(n.inputs['Alpha'].links):mat.node_tree.links.remove(link)
     n.inputs['Alpha'].default_value=1
services.RigService.apply_pose_as_rest_pose(rig)
# The fixed seated rest pose exports identically with animations disabled.
for o in bpy.data.objects:
 if o.type=='MESH':
  for p in o.data.polygons:p.use_smooth=True
  # Make current image paths absolute before packing the editable source.
  for mat in o.data.materials:
   if mat and mat.use_nodes:
    for n in mat.node_tree.nodes:
     if n.type=='TEX_IMAGE' and n.image:n.image.filepath=bpy.path.abspath(n.image.filepath)
rig.name='SeatedDriver'
out=os.path.abspath(os.environ.get('SORA_DRIVER_OUTPUT',os.path.join(ROOT,'../../../public/assets/models/driver')))
os.makedirs(out,exist_ok=True)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'working/driver-export.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(out,'driver.glb'),export_format='GLB',
 export_animations=False,export_apply=False,export_yup=True,export_extras=False,
 export_skins=True,export_morph=False,export_image_format='AUTO',
 export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,
 export_draco_position_quantization=16,export_draco_normal_quantization=12,
 export_draco_texcoord_quantization=14)
stats={'meshes':[], 'bones':len(rig.data.bones)}
for o in bpy.data.objects:
 if o.type=='MESH':
  o.data.calc_loop_triangles()
  stats['meshes'].append({'name':o.name,'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles),
   'materials':[m.name for m in o.data.materials]})
with open(os.path.join(out,'geometry.json'),'w') as f:json.dump(stats,f,indent=2)
print('EXPORTED',out,stats)
