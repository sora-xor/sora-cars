"""Keep all source texels/geometry; encode only opaque color maps as JPEG 95.

Normal maps and alpha hair/eyebrow/lash maps remain lossless PNG. No resizing,
mesh simplification, or skinning changes are performed here.
"""
from PIL import Image, ImageChops, ImageStat
from io import BytesIO
from pathlib import Path
import json,struct,hashlib,os
ROOT=Path(os.environ.get('SORA_DRIVER_TOOLING',Path(__file__).parent)).resolve()
path=Path(os.environ.get('SORA_DRIVER_OUTPUT',ROOT.parents[2]/'public/assets/models/driver'))/'driver.glb'
raw=path.read_bytes();json_len=struct.unpack_from('<I',raw,12)[0]
gltf=json.loads(raw[20:20+json_len]);binary=raw[28+json_len:]
replacements={};records=[]
for image in gltf['images']:
 if image['name'] not in ['young_lightskinned_male_diffuse3','male_casualsuit01_diffuse','shoes01_diffuse']:continue
 view=gltf['bufferViews'][image['bufferView']]
 data=binary[view['byteOffset']:view['byteOffset']+view['byteLength']]
 original=Image.open(BytesIO(data)).convert('RGB')
 output=BytesIO();original.save(output,format='JPEG',quality=95,subsampling=0,optimize=True)
 encoded=output.getvalue();replacements[image['bufferView']]=encoded
 difference=ImageStat.Stat(ImageChops.difference(original,Image.open(BytesIO(encoded))))
 image['mimeType']='image/jpeg'
 records.append({'image':image['name'],'dimensions':original.size,'sourceBytes':len(data),'outputBytes':len(encoded),
  'meanAbsoluteErrorRGB':difference.mean,'sourceSha256':hashlib.sha256(data).hexdigest()})
for material in gltf['materials']:
 cards=any(key in material['name'] for key in ['short01','eyebrow','eyelashes'])
 material['alphaMode']='MASK' if cards else 'OPAQUE'
 material['doubleSided']=cards
 if cards:material['alphaCutoff']=.38
 else:material.pop('alphaCutoff',None)
packed=bytearray()
for i,view in enumerate(gltf['bufferViews']):
 while len(packed)%4:packed.append(0)
 data=replacements.get(i,binary[view['byteOffset']:view['byteOffset']+view['byteLength']])
 view['byteOffset']=len(packed);view['byteLength']=len(data);packed.extend(data)
while len(packed)%4:packed.append(0)
gltf['buffers'][0]['byteLength']=len(packed)
meta=json.dumps(gltf,separators=(',',':')).encode()
meta+=b' '*((-len(meta))%4)
result=struct.pack('<III',0x46546c67,2,28+len(meta)+len(packed))+struct.pack('<II',len(meta),0x4e4f534a)+meta+struct.pack('<II',len(packed),0x004e4942)+packed
path.write_bytes(result)
report={'inputBytes':len(raw),'outputBytes':len(result),'sha256':hashlib.sha256(result).hexdigest(),'colorMaps':records,'geometryChanged':False,'textureDimensionsChanged':False}
(path.parent/'optimization.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
