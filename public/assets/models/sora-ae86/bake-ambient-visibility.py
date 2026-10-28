"""Bake local sky visibility from the actual licensed AE86 opaque geometry.

Run with official Blender --background --factory-startup --python this-file.py.
No GPU renderer, generic ellipse, hand-painted mask, or vehicle-height change.
Pixels contain linear visibility: 1 = unoccluded white, 0 = fully occluded.
"""
import bpy, os, math, time, json, hashlib
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from pathlib import Path
from array import array

DIRECTORY=Path(__file__).resolve().parent
SOURCE=DIRECTORY/'ae86.glb'
OUT=Path(os.environ.get('SORA_AO_OUTPUT',DIRECTORY))
OUT.mkdir(parents=True,exist_ok=True)
RESOLUTION=int(os.environ.get('SORA_AO_RESOLUTION','512'))
SAMPLES=int(os.environ.get('SORA_AO_SAMPLES','256'))
WIDTH=5.0
DEPTH=7.6
RAY_DISTANCE=1.4
ORIGIN_HEIGHT=.001
SOURCE_SHA='cc67905d1d492bf0d2eb8fc632f9baa812449770801a7eea4f7a3b50d02057e0'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==SOURCE_SHA
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
bpy.context.view_layer.update()
objects=[o for o in bpy.data.objects if o.type=='MESH']
minimum=Vector((math.inf,math.inf,math.inf));maximum=-minimum
for o in objects:
 for vertex in o.data.vertices:
  v=o.matrix_world@vertex.co
  for i in range(3):minimum[i]=min(minimum[i],v[i]);maximum[i]=max(maximum[i],v[i])
center=(minimum+maximum)*.5
scale=4.18/(maximum.y-minimum.y)
vertices=[];triangles=[];included=[];excluded=[];tyres=[]
for o in objects:
 # Match the runtime car's opaque shadow casters. Source "Shadow" is physical
 # grille/cowl backing and stays INCLUDED; the name is not a ground decal.
 if any(m and m.name in ['Windows','LampCovers'] for m in o.data.materials):
  excluded.append(o.name);continue
 offset=len(vertices)
 for vertex in o.data.vertices:
  v=o.matrix_world@vertex.co
  # Work directly in car-local X,Y,Z for clarity (+Y upward, +Z forward).
  vertices.append(Vector(((v.x-center.x)*scale,(v.z-minimum.z)*scale,-(v.y-center.y)*scale)))
 if any(m and m.name=='TireMaterial' for m in o.data.materials):
  pts=vertices[offset:]
  tyre_min=[min(v[i] for v in pts) for i in range(3)]
  tyre_max=[max(v[i] for v in pts) for i in range(3)]
  tyres.append({'name':o.name,'point':[(tyre_min[0]+tyre_max[0])*.5,tyre_min[1],(tyre_min[2]+tyre_max[2])*.5]})
 o.data.calc_loop_triangles()
 for triangle in o.data.loop_triangles:triangles.append(tuple(offset+i for i in triangle.vertices))
 included.append({'name':o.name,'triangles':len(o.data.loop_triangles)})
tree=BVHTree.FromPolygons(vertices,triangles,all_triangles=True)
print('AO_BVH_READY',len(vertices),len(triangles),scale,flush=True)
samples=[]
golden=.6180339887498949
for i in range(SAMPLES):
 r=math.sqrt((i+.5)/SAMPLES);angle=2*math.pi*((i*golden)%1)
 samples.append((r*math.cos(angle),math.sqrt(1-r*r),r*math.sin(angle)))
visibility=array('f',[1.0])*(RESOLUTION*RESOLUTION)
started=time.perf_counter()
for row in range(RESOLUTION):
 z=((row+.5)/RESOLUTION-.5)*DEPTH
 for col in range(RESOLUTION):
  x=((col+.5)/RESOLUTION-.5)*WIDTH
  origin=Vector((x,ORIGIN_HEIGHT,z))
  # Cheap exact rejection where no ray of the declared finite radius can hit.
  dx=max(abs(x)-(maximum.x-minimum.x)*scale*.5,0)
  dz=max(abs(z)-2.09,0)
  if dx*dx+dz*dz>=RAY_DISTANCE*RAY_DISTANCE:continue
  phase=((col*73856093)^(row*19349663))&65535
  angle=phase/65536*2*math.pi;c=math.cos(angle);s=math.sin(angle)
  occlusion=0.0
  for sx,sy,sz in samples:
   hit=tree.ray_cast(origin,Vector((sx*c-sz*s,sy,sx*s+sz*c)),RAY_DISTANCE)
   if hit[0] is not None:
    # Conventional local AO range: continuous zero at the cutoff, avoiding a
    # hard footprint edge. Each direction is already cosine weighted.
    occlusion+=max(0.0,1.0-(hit[3]/RAY_DISTANCE)**2)
  visibility[row*RESOLUTION+col]=1.0-occlusion/SAMPLES
 if row%32==0:print('AO_PROGRESS',row,RESOLUTION,round(time.perf_counter()-started,2),flush=True)

# Blender's pixel origin is lower-left: the saved PNG top edge therefore maps
# to +Z. Texture UV (0,0) maps to car-local (-WIDTH/2, -DEPTH/2).
pixels=array('f')
for value in visibility:pixels.extend((value,value,value,1.0))
image=bpy.data.images.new('AE86 source ambient visibility',width=RESOLUTION,height=RESOLUTION,alpha=False,float_buffer=True)
image.colorspace_settings.name='Non-Color'
image.pixels.foreach_set(pixels)
image.file_format='PNG';image.filepath_raw=str(OUT/'ambient-visibility.png');image.save()
edge=[visibility[r*RESOLUTION+c] for r in range(RESOLUTION) for c in range(RESOLUTION) if r in [0,RESOLUTION-1] or c in [0,RESOLUTION-1]]
report={'sourceSha256':SOURCE_SHA,'method':'cosine-weighted hemisphere ray casts against exact opaque source triangles',
 'normalization':{'scale':scale,'sourceCenterBlender':list(center),'sourceMinBlenderZ':minimum.z},
 'resolution':[RESOLUTION,RESOLUTION],'samplesPerPixel':SAMPLES,'widthMeters':WIDTH,'depthMeters':DEPTH,
 'originHeightMeters':ORIGIN_HEIGHT,'rayDistanceMeters':RAY_DISTANCE,'distanceWeight':'1 - (distance / 1.4)^2',
 'colorSpace':'linear, no color transform','channels':'RGB visibility; 1 white means no occlusion; opacity = 1 - red',
 'uv':{'u0':'-X','u1':'+X','v0':'-Z','v1':'+Z','pngTop':'+Z'},
 'triangleCount':len(triangles),'included':included,'excluded':excluded,'minimumVisibility':min(visibility),
 'meanVisibility':sum(visibility)/len(visibility),'minimumEdgeVisibility':min(edge),
 'elapsedSeconds':time.perf_counter()-started,'blenderVersion':bpy.app.version_string,
 'textureSha256':hashlib.sha256((OUT/'ambient-visibility.png').read_bytes()).hexdigest()}
for tyre in tyres:
 x,y,z=tyre['point']
 col=max(0,min(RESOLUTION-1,int((x/WIDTH+.5)*RESOLUTION)))
 row=max(0,min(RESOLUTION-1,int((z/DEPTH+.5)*RESOLUTION)))
 tyre['visibilityAtGroundContact']=visibility[row*RESOLUTION+col]
report['tyreContacts']=tyres
(OUT/'ambient-visibility.json').write_text(json.dumps(report,indent=2)+'\n')
print('AO_FINISHED',json.dumps({k:v for k,v in report.items() if k not in ['included','excluded']}),flush=True)
