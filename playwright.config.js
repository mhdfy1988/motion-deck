import {defineConfig} from '@playwright/test';
const port=Number(process.env.MOTIONDECK_TEST_PORT||8901);
const baseURL=`http://127.0.0.1:${port}`;
// 暂停的姿势编辑、导入以及全身试摆用独立实验验收，不混入正式界面门禁。
export default defineConfig({
 testDir:'./tests/motion-lab',timeout:60000,workers:1,
 // 素材剪贴板与已有库入口一起验收。
 testMatch:['ai-workspace','library-components','library-clipboard','library-rename','root-motion','workbench-operations','dropdown-style','standalone','builtin-expansion','builtin-models','clear-timeline','custom-library','default-actions','library-delete','model-catalog','model-ready','motion-export','playback-mode','pose-edit-hidden','rotation-modes','joint-limits','finger-edit','user-limb-edit','pose-library','prompts-composite','source-placement','timeline-edge-modes','timeline-edit','timeline-geometry','timeline-selection','transition-placement','view-presets','reference-capture','observation-camera'].map(name=>name+'.spec.js'),
 use:{baseURL,channel:'chrome',headless:true,viewport:{width:1440,height:900},
  // 仅显式诊断启用官方GPU-less图形驱动；普通门禁与客户端不变。
  ...(process.env.MOTIONDECK_DIAGNOSTIC_SWANGLE==='1'?{launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader']}}:{})},reporter:'list',
 webServer:{command:'npm run dev',env:{PORT:String(port)},url:baseURL,reuseExistingServer:!process.env.CI,timeout:30000}
});
