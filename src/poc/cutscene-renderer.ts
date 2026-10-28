import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { cutsceneShader } from './cutscene-shader';
import { createGlazingMask } from './glazing-mask';
import { createIllustratedLinework, illustratedLineworkCompose, illustratedLineworkDeclarations } from './illustrated-linework';
import { illustratedPixelShader } from './illustrated-pixels';
import { PixelClusterPass } from './pixel-cluster-pass';

/** Isolated POC pipeline; production racing rendering is unchanged. */
export function createCutsceneRenderer(renderer: THREE.WebGLRenderer) {
  const depth=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  depth.minFilter=depth.magFilter=THREE.NearestFilter;
  const target=new THREE.WebGLRenderTarget(1,1,{
    type:THREE.HalfFloatType,depthTexture:depth,depthBuffer:true,
    resolveDepthBuffer:true,stencilBuffer:false,
    samples:Math.min(4,renderer.capabilities.maxSamples),generateMipmaps:false,
  });
  const composer=new EffectComposer(renderer,target);composer.setPixelRatio(1);
  const empty=new THREE.Scene(),initialCamera=new THREE.PerspectiveCamera();
  const beauty=new RenderPass(empty,initialCamera);
  const glazing=createGlazingMask(renderer);
  const linework=createIllustratedLinework(renderer);
  let illustrated=false,painted=true,lightBloom=0,pixelEnabled=true;
  // Geometry-derived contours can be evaluated without enabling authored
  // material painting. Null preserves the previous material-study behavior.
  let geometryLinework: boolean | null = null;
  const drawLinework=()=>illustrated&&(geometryLinework??painted);
  // Snapshot scene depth before color ping-pong, including when MSAA is off.
  const preservedDepth=new THREE.WebGLRenderTarget(1,1,{
    format:THREE.RedFormat,type:THREE.UnsignedByteType,depthTexture:depth.clone(),
    depthBuffer:true,stencilBuffer:false,generateMipmaps:false,
    minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,
  });
  linework.setBeautyDepth(preservedDepth.depthTexture!);
  const beautyRender=beauty.render.bind(beauty);
  beauty.render=(...args)=>{
    beautyRender(...args);
    const previous=renderer.getRenderTarget();
    const previousFace=renderer.getActiveCubeFace(),previousMip=renderer.getActiveMipmapLevel();
    try {
      renderer.initRenderTarget(preservedDepth);
      renderer.copyTextureToTexture(args[2].depthTexture!,preservedDepth.depthTexture!);
      glazing.render(preservedDepth.depthTexture!,beauty.camera,beauty.scene);
      if(drawLinework())linework.render(beauty.scene,beauty.camera);
    }
    finally {renderer.setRenderTarget(previous,previousFace,previousMip);}
  };
  const contact=new GTAOPass(empty,initialCamera,1,1);contact.setGBuffer(depth);
  contact.blendIntensity=.23;
  contact.updateGtaoMaterial({radius:.24,thickness:.1,distanceFallOff:1,scale:1,samples:16,screenSpaceRadius:false});
  contact.updatePdMaterial({radius:3,rings:2,samples:16,lumaPhi:10,depthPhi:2,normalPhi:3});
  const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.08,.1,1.8);
  const output=new OutputPass();
  const vertex=/* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
  const painting=new ShaderPass({name:'SORA custom painted cutscene shader',
    uniforms:{tDiffuse:{value:null},sceneDepth:{value:null},glazingMask:{value:null},glazingMaskEnabled:{value:1},resolution:{value:new THREE.Vector2(1,1)},
      cameraNear:{value:.08},cameraFar:{value:300},cameraPerspective:{value:1},finishStrength:{value:1},painterStrength:{value:1},referenceStyleStrength:{value:0}},
    vertexShader:vertex,fragmentShader:cutsceneShader,
  });
  const illustratedFinish=new ShaderPass({name:'Material-aware illustrated linework',
    uniforms:{tDiffuse:{value:null},glazingMask:{value:null}},vertexShader:vertex,
    fragmentShader:`uniform sampler2D tDiffuse;uniform sampler2D glazingMask;varying vec2 vUv;
      ${illustratedLineworkDeclarations}\n${illustratedLineworkCompose}
      void main(){vec2 uv=illustratedGridUv(vUv);vec4 source=texture2D(tDiffuse,uv);float glass=texture2D(glazingMask,uv).r;
        gl_FragColor=vec4(applyIllustratedLinework(source.rgb,uv,1.-glass),source.a);}`,
  });
  Object.assign(illustratedFinish.uniforms,linework.uniforms);
  illustratedFinish.enabled=false;
  const pixel=new ShaderPass({name:'Final fine pixel finish',
    uniforms:{tDiffuse:{value:null},resolution:{value:new THREE.Vector2(1,1)},detailPreservation:{value:0}},vertexShader:vertex,
    fragmentShader:illustratedPixelShader,
  });
  for(const p of [painting,illustratedFinish,pixel]) {p.material.depthTest=p.material.depthWrite=false;p.material.toneMapped=false;p.material.blending=THREE.NoBlending;}
  // Pigment lighting (mesh shaders) -> HDR/MSAA -> AO -> bloom -> one output
  // conversion -> perceptual painted shapes/ink -> optional crisp pixel grid.
  const clusters=new PixelClusterPass();
  // Form shared color regions before adding structural ink. Otherwise narrow
  // creases get averaged into a large region and lose their drawn character.
  for(const p of [beauty,contact,bloom,output,painting,clusters,illustratedFinish,pixel])composer.addPass(p);
  const drawing=new THREE.Vector2(),savedViewport=new THREE.Vector4(),savedScissor=new THREE.Vector4();
  const savedClearColor=new THREE.Color();
  let w=0,h=0,disposed=false;
  return {
    linework,
    clusters,
    setGeometryLinework(enabled:boolean|null){geometryLinework=enabled;illustratedFinish.enabled=drawLinework();},
    setPixelClusters(enabled:boolean){clusters.enabled=enabled;pixel.enabled=pixelEnabled&&!enabled;clusters.configure({pixelSize:pixelEnabled?2:1});},
    setIllustrated(enabled:boolean){illustrated=enabled;painting.enabled=!enabled;
      illustratedFinish.enabled=drawLinework();bloom.strength=enabled?lightBloom:.08;pixel.uniforms.detailPreservation.value=enabled?1:0;},
    setLightBloom(value:number){lightBloom=THREE.MathUtils.clamp(value,0,.3);if(illustrated)bloom.strength=lightBloom;},
    setPixelDetail(value:number){pixel.uniforms.detailPreservation.value=THREE.MathUtils.clamp(value,0,1);},
    setPixelation(enabled:boolean){if(!disposed){pixelEnabled=enabled;pixel.enabled=enabled&&!clusters.enabled;clusters.configure({pixelSize:enabled?2:1});}},
    setPainted(enabled:boolean){if(!disposed){painted=enabled;painting.uniforms.finishStrength.value=enabled?1:0;
      illustratedFinish.enabled=drawLinework();
      bloom.strength=illustrated?lightBloom:THREE.MathUtils.lerp(.08,.015,enabled?painting.uniforms.referenceStyleStrength.value:0);}},
    setReferenceStyleStrength(value:number){if(!disposed){const amount=THREE.MathUtils.clamp(value,0,1);
      painting.uniforms.referenceStyleStrength.value=amount;
      bloom.strength=THREE.MathUtils.lerp(.08,.015,painting.uniforms.finishStrength.value*amount);}},
    setPainterStrength(strength:number){if(!disposed)painting.uniforms.painterStrength.value=THREE.MathUtils.clamp(strength,0,1);},
    setGlazingMeshes(meshes:THREE.Mesh[]){if(!disposed)glazing.setMeshes(meshes);},
    setGlazingMaskEnabled(enabled:boolean){if(!disposed)painting.uniforms.glazingMaskEnabled.value=enabled?1:0;},
    /** Dimensions are physical output pixels; the caller owns camera projection. */
    render(scene:THREE.Scene,camera:THREE.Camera,width:number,height:number,_time:number){
      if(disposed||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
      const outputW=Math.max(1,Math.round(width)),outputH=Math.max(1,Math.round(height));
      const scale=Math.min(1,Math.sqrt(1920*1080/(outputW*outputH)));
      const nextW=Math.max(1,Math.floor(outputW*scale)),nextH=Math.max(1,Math.floor(outputH*scale));
      if(w!==nextW||h!==nextH){w=nextW;h=nextH;composer.setSize(w,h);preservedDepth.setSize(w,h);glazing.setSize(w,h);linework.setSize(w,h);
        painting.uniforms.resolution.value.set(w,h);pixel.uniforms.resolution.value.set(w,h);}
      beauty.scene=contact.scene=scene;beauty.camera=contact.camera=camera;
      const perspective=camera.projectionMatrix.elements[11]===-1?1:0;
      const projectionCamera=camera as THREE.PerspectiveCamera|THREE.OrthographicCamera;
      painting.uniforms.cameraNear.value=projectionCamera.near;painting.uniforms.cameraFar.value=projectionCamera.far;
      painting.uniforms.cameraPerspective.value=perspective;
      if(contact.gtaoMaterial.defines.PERSPECTIVE_CAMERA!==perspective){
        contact.gtaoMaterial.defines.PERSPECTIVE_CAMERA=perspective;
        contact.gtaoMaterial.needsUpdate=true;
      }
      // Optional passes change color-buffer parity. Use the depth attachment
      // that this frame's RenderPass will populate, not a constructor target.
      if(contact.depthTexture!==composer.readBuffer.depthTexture)contact.setGBuffer(composer.readBuffer.depthTexture!);
      painting.uniforms.sceneDepth.value=preservedDepth.depthTexture;
      clusters.setDepth(preservedDepth.depthTexture!,camera);
      // A two-pixel finish at a390px viewport would discard half its already
      // limited detail. Keep one physical pixel there; clustering still runs.
      clusters.configure({pixelSize:pixelEnabled&&w>=800?2:1});
      linework.setPixelSize(clusters.enabled&&pixelEnabled&&w>=800?2:1);
      // ShaderPass clones initial uniform textures. Bind the actual rendered
      // attachment here, as with sceneDepth, rather than an unrendered clone.
      painting.uniforms.glazingMask.value=glazing.texture;
      illustratedFinish.uniforms.glazingMask.value=glazing.texture;
      renderer.getDrawingBufferSize(drawing);
      if(drawing.x!==outputW||drawing.y!==outputH||renderer.getPixelRatio()!==1)
        renderer.setDrawingBufferSize(outputW,outputH,1);

      const savedTarget=renderer.getRenderTarget(),savedFace=renderer.getActiveCubeFace(),savedMip=renderer.getActiveMipmapLevel();
      const savedAutoClear=renderer.autoClear,savedAutoClearColor=renderer.autoClearColor;
      const savedAutoClearDepth=renderer.autoClearDepth,savedAutoClearStencil=renderer.autoClearStencil;
      const savedScissorTest=renderer.getScissorTest(),savedXrEnabled=renderer.xr.enabled;
      const savedToneMapping=renderer.toneMapping,savedOutputColorSpace=renderer.outputColorSpace;
      const savedClearAlpha=renderer.getClearAlpha();
      renderer.getClearColor(savedClearColor);renderer.getViewport(savedViewport);renderer.getScissor(savedScissor);
      try {
        renderer.xr.enabled=false;renderer.autoClear=false;
        renderer.autoClearColor=renderer.autoClearDepth=renderer.autoClearStencil=true;
        renderer.setScissorTest(false);renderer.setViewport(0,0,outputW,outputH);
        // Preserve the POC's single ACES/sRGB conversion before painted marks.
        renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.outputColorSpace=THREE.SRGBColorSpace;
        composer.render(0);
      } finally {
        renderer.setRenderTarget(savedTarget,savedFace,savedMip);
        renderer.setViewport(savedViewport);renderer.setScissor(savedScissor);renderer.setScissorTest(savedScissorTest);
        renderer.setClearColor(savedClearColor,savedClearAlpha);
        renderer.autoClear=savedAutoClear;renderer.autoClearColor=savedAutoClearColor;
        renderer.autoClearDepth=savedAutoClearDepth;renderer.autoClearStencil=savedAutoClearStencil;
        renderer.xr.enabled=savedXrEnabled;renderer.toneMapping=savedToneMapping;renderer.outputColorSpace=savedOutputColorSpace;
      }
    },
    dispose(){
      if(disposed)return;
      disposed=true;
      contact.dispose();contact.gtaoMaterial.dispose();contact.blendMaterial.dispose();
      bloom.dispose();bloom.materialHighPassFilter.dispose();output.dispose();painting.dispose();illustratedFinish.dispose();pixel.dispose();
      clusters.dispose();linework.dispose();glazing.dispose();preservedDepth.dispose();composer.dispose();
      composer.passes.length=0;
      beauty.scene=contact.scene=empty;beauty.camera=contact.camera=initialCamera;
    },
  };
}
