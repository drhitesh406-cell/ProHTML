/* ProHTML: exact question-code lookup and remembered single-MCQ practice.
 * Database metadata is local; only the matching pinned topic JSON is fetched.
 * No library files, quiz-progress keys, timers or summary pages are created.
 */
(() => {
  'use strict';
  const ANSWER_PREFIX = 'hr.mcq.answer.v1.';
  const DB_NAME = 'prohtml-mcq-lookup-v1';
  const INDEX_URL = new URL('assets/mcq-question-index.json', document.baseURI).href;
  const HUB_INDEX_URL = new URL('assets/mcq-qbank-hub-pyq-index.json', document.baseURI).href;
  const QUESTION_CSS = "\n:root{--cyan:#5ec1da;--cyan-d:#1b7f9a;--bg:#f5f6f7;--ink:#1d1d1f;--mut:#5b676d;--dot:#7f8d94;--ok:#1f8a5b;--bad:#c0392b;--warn:#e69316}\n*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}\nhtml,body{height:100%;margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,\"SF Pro Text\",\"Helvetica Neue\",Arial,sans-serif;overscroll-behavior:none}\n#root{height:100%;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}\n.bar{height:5px;background:#d0d7da;flex:none}\n.fsb{width:38px;height:38px;border-radius:50%;border:1px solid #dfe5e8;background:#fff;color:#44525a;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;flex:none}\n.fsb svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}\n.fsb .ex-i{display:none}.is-fs .fsb .en-i{display:none}.is-fs .fsb .ex-i{display:inline}\n.brand .fsb{width:34px;height:34px}\n.bar i{display:block;height:100%;background:var(--cyan);width:0;transition:width .5s linear}\nheader{display:flex;align-items:center;gap:12px;padding:10px 20px 8px;flex:none;background:#fff;border-bottom:1px solid #e3e8ea;flex-wrap:wrap}\n.brand{font:700 20px/1.15 -apple-system,\"SF Pro Display\",\"Helvetica Neue\",Arial,sans-serif;color:var(--cyan-d);letter-spacing:-.01em;margin-right:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap}\n.tsw{font:600 13px/1 -apple-system,sans-serif;padding:6px 10px;border-radius:8px;border:1px solid #cfd6da;background:#f5f7f8;color:#1d1d1f;cursor:pointer;max-width:240px}\n.sec-pill{color:var(--mut);font-size:13.5px;font-weight:600;background:#eef2f4;padding:6px 11px;border-radius:99px}\n.qtop{display:flex;align-items:center;gap:8px}\n.qbadge{font:700 13.5px/1 -apple-system,\"SF Pro Text\",sans-serif;padding:7px 12px;border-radius:8px;border:1px solid #cfd6da;background:#fff;color:#334148;display:inline-flex;align-items:center;gap:6px}\n.qbadge.ans{background:var(--cyan-d);border-color:var(--cyan-d);color:#fff}\n.qbadge.mark{background:var(--warn);border-color:var(--warn);color:#fff}\n.qbadge.ans.mark{box-shadow:inset 0 -4px 0 var(--cyan-d)}\n.pb{font:600 13.5px/1 -apple-system,\"SF Pro Text\",Arial,sans-serif;border:1px solid var(--cyan-d);background:#eef8fb;color:var(--cyan-d);padding:8px 13px;border-radius:8px;cursor:pointer}\n.pb:hover{background:#dff2f8}\n.timer{font:700 18px/1 ui-monospace,\"SF Mono\",Menlo,monospace;color:var(--ink);min-width:68px;text-align:right}\n.timer.low{color:var(--bad)}\n.x{width:38px;height:38px;border-radius:50%;border:1px solid #dfe5e8;background:#fff;font-size:16px;font-weight:700;color:#44525a;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}\nmain{flex:1;overflow:auto;padding:16px 20px 10px}\n.qn-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap}\n.qn{font-size:13.5px;font-weight:600;color:var(--mut)}\n.q{font-size:clamp(16px,1.4vw,18.5px);font-weight:600;line-height:1.5;color:var(--ink);word-break:break-word}\n.q p{margin:0 0 8px}\n.q p:last-child{margin-bottom:0}\n/* ---------- FIXED: images fully visible, preserve aspect ratio, no cropping / no scroll ---------- */\n.q img,.ex img{max-width:100%;height:auto;width:auto;max-height:75vh;border-radius:10px;border:1px solid #e1e6e8;background:#fff;cursor:zoom-in;object-fit:contain;display:block;margin:10px 0}\n.opt img{max-width:min(100%,360px);max-height:170px;width:auto;height:auto;object-fit:contain;margin:6px 0;border:1px solid #e6ebed;border-radius:6px;background:#fff}\n.img-wrap{display:flex;flex-wrap:wrap;align-items:flex-start;gap:12px;margin:14px 0;width:100%}\n.img-frame{width:100%;max-width:760px;min-height:320px;height:auto;border:1px solid #e1e6e8;border-radius:10px;background:#fff;display:block;overflow:hidden}\n/* Each image lives in a fluid card — no fixed box, no overflow hidden, fully visible */\n.img-box{flex:1 1 320px;max-width:calc(50% - 6px);min-width:280px;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid #e1e6e8;border-radius:10px;padding:8px;box-sizing:border-box;overflow:visible;width:auto;height:auto;min-height:0}\n.img-wrap > .img-box:only-child{flex:0 1 auto;max-width:min(100%,720px);min-width:min(100%,420px);width:auto}\n.q .img-box img,.ex .img-box img,.img-box img{width:100%;height:auto;max-width:100%;max-height:66vh;object-fit:contain;margin:0;border:0;border-radius:6px;display:block;cursor:zoom-in;background:#fff}\n.img-box img.fitted{max-width:100%!important;max-height:66vh!important;width:100%!important;height:auto!important;object-fit:contain!important}\n.img-box>div,.img-box>.img-frame{width:100%;max-width:100%}\n.img-box .img-frame{margin:0;border:0;width:100%;min-height:300px}\n.img-err{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;background:#fbeae8;color:var(--bad);border-radius:8px;font-size:13px;margin:6px 0}\n@media(max-width:720px){\n  .img-box{flex:1 1 100%;max-width:100%;min-width:0}\n  .img-wrap > .img-box:only-child{max-width:100%;min-width:0}\n  .q .img-box img,.ex .img-box img,.img-box img{max-height:58vh}\n  .q img,.ex img{max-height:62vh}\n}\n.opts{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 20px 12px;flex:none}\n.opt{display:flex;align-items:center;gap:10px;text-align:left;min-height:50px;padding:10px 14px;background:#fff;border:1.5px solid #dde3e6;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.04);font:inherit;font-size:clamp(15px,1.3vw,17px);font-weight:600;line-height:1.4;color:var(--ink);cursor:pointer;transition:border-color .12s,background .12s}\n.opt:hover{border-color:var(--cyan)}\n.opt span:last-child{flex:1;min-width:0;overflow-wrap:break-word}\n.opt .l{color:#7f8d94;font-weight:700;font-size:14.5px;flex:none}\n.opt.sel{border-color:var(--cyan-d);background:#a9dcec;font-weight:600}\n.opt.sel .l{color:var(--cyan-d)}\n.nav{display:flex;gap:8px;padding:0 20px 14px;flex:none;flex-wrap:wrap;align-items:center}\n.nav .sp{flex:1}\n.btn{font:inherit;font-weight:600;font-size:14px;border:1px solid #cfd6da;background:#fff;color:var(--ink);padding:9px 16px;border-radius:99px;cursor:pointer}\n.btn.pri{background:var(--cyan-d);border-color:var(--cyan-d);color:#fff}\n.btn.dng{border-color:var(--bad);color:var(--bad)}\n.btn:disabled{opacity:.38;cursor:not-allowed}\n.btn.on{background:var(--warn);border-color:var(--warn);color:#fff}\n@media(max-width:640px){.opts{grid-template-columns:1fr;gap:8px}.opt{min-height:46px;padding:9px 12px}header{padding:8px 14px}main,.opts,.nav{padding-left:14px;padding-right:14px}}\n.page{max-width:980px;margin:0 auto;padding:22px 20px 44px;overflow:auto;width:100%;flex:1;min-height:0}\n.page h1{font-size:24px;margin:0 0 4px}\n.page p{color:var(--mut);line-height:1.5;font-size:14.5px;margin:6px 0}\n.card{background:#fff;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,.06);border:1px solid #e6ebed;padding:16px 18px;margin:12px 0}\n.kv{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #eceff1;font-size:14.5px}\n.kv:last-child{border:0}\ntable{width:100%;border-collapse:collapse;font-size:14px}\nth,td{padding:9px 6px;text-align:right;border-bottom:1px solid #eceff1}\nth:first-child,td:first-child{text-align:left}\n.big{font-size:38px;font-weight:700;color:var(--cyan-d)}\n.chips{display:flex;gap:7px;margin:10px 0;flex-wrap:wrap}\n.chip{padding:6px 13px;border-radius:99px;border:1px solid #d3dade;background:#fff;font:inherit;font-size:13px;font-weight:600;cursor:pointer;color:var(--ink)}\n.chip.on{background:var(--cyan-d);color:#fff;border-color:var(--cyan-d)}\n.rv .opt{min-height:0;cursor:default;margin:7px 0;padding:10px 14px;font-size:16px;font-weight:600;box-shadow:none;border:1px solid #e1e6e8}\n.rv .opt.ok{background:#e7f6ee;border-color:var(--ok)}\n.rv .opt.no{background:#fbeae8;border-color:var(--bad)}\n.rv .q{font-size:17px;font-weight:600;margin-bottom:12px}\n.ex{margin-top:12px;padding:12px 14px;background:#f1f6f8;border-radius:8px;font-size:14.5px;color:#222;line-height:1.55;overflow-wrap:break-word}\n.ov{position:fixed;inset:0;background:rgba(0,0,0,.48);display:flex;align-items:center;justify-content:center;z-index:20;padding:18px}\n.md{background:#fff;border-radius:14px;padding:20px;max-width:440px;width:100%;max-height:88vh;display:flex;flex-direction:column}\n.md h3{margin:0 0 6px;font-size:18px}.md p{margin:0 0 12px;color:var(--mut);font-size:13.5px;line-height:1.45}\n.mb{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:8px}\n.pm{max-width:640px}\n.pal{display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:7px;margin:8px 0 12px;max-height:46vh;overflow:auto;padding:3px}\n.pn{height:42px;border-radius:8px;border:1px solid #cfd6da;background:#f8fafb;color:#44525a;font:700 14px/1 -apple-system,\"SF Pro Text\",Arial,sans-serif;cursor:pointer}\n.pn.ans{background:var(--cyan-d);border-color:var(--cyan-d);color:#fff}\n.pn.mark{background:var(--warn);border-color:var(--warn);color:#fff}\n.pn.ans.mark{box-shadow:inset 0 -5px 0 var(--cyan-d)}\n.pn.un{background:#fff;border-color:#cfd6da;color:#44525a}\n.pn.cur{outline:3px solid var(--cyan);outline-offset:1px}\n.lg{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--mut);margin-bottom:10px}\n.lg i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-2px;border:1px solid #cfd6da;background:#fff}\n.lg i.ans{background:var(--cyan-d);border-color:var(--cyan-d)}.lg i.mark{background:var(--warn);border-color:var(--warn)}\n.lk{background:none;border:0;padding:0;font:inherit;font-weight:600;color:var(--cyan-d);text-decoration:underline;cursor:pointer;text-align:left}\n.frow{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0;align-items:center}\n.rsel{font:inherit;font-size:14px;font-weight:500;padding:8px 11px;border-radius:8px;border:1px solid #cfd6da;background:#fff;color:#1d1d1f;min-width:190px;flex:1;max-width:310px}\n.rc{align-self:center;font-weight:600;font-size:14px;color:var(--mut);padding:0 6px}\n.pn.ok{background:var(--ok);border-color:var(--ok);color:#fff}\n.pn.no{background:var(--bad);border-color:var(--bad);color:#fff}\n.lg i.ok{background:var(--ok);border-color:var(--ok)}.lg i.no{background:var(--bad);border-color:var(--bad)}\n.toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 14px);transform:translateX(-50%);background:#16252b;color:#fff;padding:10px 18px;border-radius:99px;font-size:14px;font-weight:500;z-index:30;box-shadow:0 4px 16px rgba(0,0,0,.25)}\n.nl{display:flex;gap:12px;align-items:flex-start;padding:8px 0;border-top:1px solid #eceff1}\n.nl:first-of-type{border-top:0}\n.nl .lb{flex:none;width:130px;font-size:13.5px;color:var(--mut)}\n.nl>div{display:flex;flex-wrap:wrap;gap:6px}\n.nc{min-width:34px;height:30px;padding:0 6px;border-radius:7px;border:1px solid transparent;font:600 13px/1 inherit;cursor:pointer;color:#fff}\n.nc.ok{background:var(--ok)}.nc.no{background:var(--bad)}.nc.un{background:#8a979d}\n.none{color:#9aa5ab;font-size:13.5px}\n.tag{display:inline-block;padding:2px 9px;border-radius:99px;font-size:11.5px;font-weight:700;margin-left:6px}\n.tag.ok{background:#e7f6ee;color:var(--ok)}.tag.no{background:#fbeae8;color:var(--bad)}.tag.un{background:#eceff1;color:#62737b}\n.gh{margin:22px 0 6px;font-size:17px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}\n.gh small{font-weight:400;color:var(--mut);font-size:13px;margin-left:6px}\n.rv .mk{margin-left:auto;font-size:12.5px;font-weight:700;flex:none;padding-left:10px}\n.note{font-size:12.5px;color:var(--mut)}\n.zoom-ov{position:fixed;inset:0;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px;cursor:zoom-out}\n.zoom-ov img{max-width:96vw;max-height:92vh;object-fit:contain;border-radius:6px;background:#fff}\n.subj-edit{font:inherit;font-size:12px;padding:2px 6px;border-radius:6px;border:1px solid #d3dade;background:#fff;color:var(--mut);margin-left:6px}\n/* ---------- Analytics page (score summary) ---------- */\n.hero{background:linear-gradient(135deg,var(--cyan-d),var(--cyan));color:#fff;border-radius:14px 14px 0 0;padding:20px 22px 16px;text-align:center;margin-top:10px}\n.page .hero h1{margin:0;font-size:23px;color:#fff;letter-spacing:-.01em}\n.hero .hs{font-size:13.5px;opacity:.93;margin-top:5px;font-weight:500}\n.scb{background:#fff;border:1px solid #e6ebed;border-top:0;border-radius:0 0 14px 14px;box-shadow:0 1px 6px rgba(0,0,0,.06);padding:20px 18px 18px;text-align:center}\n.scb .num{font-size:54px;font-weight:700;color:var(--cyan-d);line-height:1}\n.scb .of{color:var(--mut);font-size:15px;margin-top:6px}\n.acc{display:inline-block;margin-top:12px;padding:6px 16px;border-radius:99px;background:#eef8fb;color:var(--cyan-d);font-weight:700;font-size:14px;border:1px solid #cfe8f0}\n.rings{display:flex;justify-content:center;gap:clamp(14px,6vw,52px);margin-top:20px;flex-wrap:wrap}\n.rg{background:none;border:0;padding:0;cursor:pointer;font:inherit;color:var(--mut);display:flex;flex-direction:column;align-items:center;gap:8px}\n.rg:hover .rgl{color:var(--cyan-d)}\n.rgc{position:relative;width:96px;height:96px;display:block}\n.rgc svg{width:100%;height:100%;display:block}\n.rgc b{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:600;color:var(--ink)}\n.rt{fill:none;stroke:#e3e9ec;stroke-width:7}\n.rp{fill:none;stroke-width:7;stroke-linecap:round}\n.rp.ok{stroke:var(--ok)}.rp.no{stroke:var(--bad)}.rp.un{stroke:#8a979d}\n.rgl{font-weight:600;font-size:14.5px}\n.sj{cursor:pointer;margin:10px 0;transition:border-color .12s}\n.sj:hover{border-color:var(--cyan)}\n.sj h3{margin:0 0 6px;font-size:18px;display:flex;align-items:center;gap:9px;flex-wrap:wrap}\n.sbadge{font-size:11px;font-weight:800;letter-spacing:.05em;padding:3px 8px;border-radius:6px}\n.sbadge.best{background:#e7f6ee;color:var(--ok)}.sbadge.weak{background:#fbeae8;color:var(--bad)}\n.sj .ys{font-size:14px;color:var(--mut)}\n.sj .ys b,.sfoot b{color:var(--ink)}\n.pbar{display:flex;align-items:center;gap:10px;margin:8px 0 12px;font-size:13.5px;color:var(--mut)}\n.pbar .trk{flex:1;height:8px;border-radius:99px;background:#e3e9ec;overflow:hidden}\n.pbar .trk i{display:block;height:100%;background:var(--cyan);border-radius:99px}\n.pbar b{min-width:44px;text-align:right;color:var(--ink)}\n.pills{display:flex;gap:8px;flex-wrap:wrap}\n.cp{padding:3px 13px;border-radius:99px;font-size:12.5px;font-weight:600;border:1px solid}\n.cp.ok{color:var(--ok);border-color:#a9d9c2;background:#f3fbf7}.cp.no{color:var(--bad);border-color:#efb8b1;background:#fdf5f4}.cp.un{color:#62737b;border-color:#cfd6da;background:#f6f8f9}\n.sfoot{margin-top:11px;font-size:13.5px;color:var(--mut)}\n.tcard{text-align:center;padding:0}\n.tcard .tt{padding:18px 10px 14px;border-bottom:1px solid #eceff1}\n.tcard .tv{font:600 34px/1.1 ui-monospace,\"SF Mono\",Menlo,monospace;color:var(--ink)}\n.tcard .tl{font-size:13.5px;color:var(--mut);margin-top:4px}\n.tcard .t2{display:flex}\n.tcard .t2>div{flex:1;padding:14px 8px}\n.tcard .t2>div+div{border-left:1px solid #eceff1}\n.tcard .t2 .tv{font-size:22px}\n.tcard .ta{padding:0 10px 14px}\n.tcard .ta span{display:inline-block;background:#eef8fb;color:var(--cyan-d);font-weight:600;font-size:13.5px;padding:6px 16px;border-radius:8px}\n.ins{display:flex;gap:16px;align-items:center;border-radius:10px;padding:16px 18px;margin:12px 0;border:1px solid}\n.ins.good{background:#eef8f2;border-color:#cfe9db}\n.ins.warn{background:#fff6e8;border-color:#f3dcb5}\n.ins.neutral{background:#fff;border-color:#e6ebed}\n.ins .bub{flex:none;min-width:58px;height:58px;padding:0 6px;box-sizing:border-box;border-radius:99px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;color:#fff;background:var(--ok)}\n.ins.warn .bub{background:var(--warn)}.ins.neutral .bub{background:var(--dot)}\n.ins h3{margin:0 0 4px;font-size:17px}\n.ins p{margin:0}\n.ins .lks{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:13.5px}\n.chgc .cn{font-size:22px;color:var(--ink)}\n.chgc .cn b{color:var(--cyan-d)}\n/* ---------- Guess tick box (exam) ---------- */\n.gk{display:inline-flex;align-items:center;gap:8px}\n.gk .cb{width:16px;height:16px;border:2px solid #8a979d;border-radius:4px;background:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11px;line-height:1;color:#fff;box-sizing:border-box}\n.gk.sel{border-color:var(--cyan-d);background:#eef8fb;color:var(--cyan-d)}\n.gk.sel .cb{background:var(--cyan-d);border-color:var(--cyan-d)}\n.gk.sel .cb::after{content:\"\\2713\"}\n/* ---------- Answers filter dropdown (review) ---------- */\n.fdd{position:relative;display:inline-block}\n.fddb{font:inherit;font-size:14px;font-weight:600;padding:8px 12px;border-radius:8px;border:1px solid #cfd6da;background:#fff;color:var(--ink);cursor:pointer;display:inline-flex;gap:10px;align-items:center}\n.fddb i{font-style:normal;font-size:11px;color:var(--mut)}\n.fbd{display:none;position:fixed;left:0;right:0;top:0;bottom:0;z-index:15}\n.fdd.open .fbd{display:block}\n.fddm{display:none;position:absolute;right:0;max-width:calc(100vw - 24px);top:calc(100% + 6px);z-index:16;min-width:260px;background:#fff;border:1px solid #dfe5e8;border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:8px 0}\n.fdd.open .fddm{display:block}\n.fddm .fh{padding:6px 16px 8px;font-size:13px;font-weight:600;color:#8a979d}\n.fi{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:0;font:inherit;font-size:15px;padding:10px 16px;cursor:pointer;color:var(--ink)}\n.fi:hover{background:#f1f6f8}\n.fi .ck{width:16px;flex:none;color:var(--cyan-d);font-weight:700}\n.fi.on{color:var(--cyan-d);font-weight:700}\n.fi.dis{color:#b4bec3;cursor:not-allowed}\n.fi.dis:hover{background:none}\n.tag.gs{background:#fff4e0;color:#a55f00}.tag.ch{background:#e3f3f8;color:var(--cyan-d)}\n/* ---------- Explanation formatting fix (tables / lists / alignment) ---------- */\n.ex,.q{text-align:left}\n.ex *{text-align:left!important;direction:ltr!important;unicode-bidi:normal!important;text-indent:0!important;max-width:100%}\n.ex p{margin:0 0 8px!important}\n.ex p:last-child{margin-bottom:0!important}\n.ex ul,.ex ol{margin:6px 0!important;padding-left:24px!important}\n.ex li{margin:3px 0!important;padding-left:0!important}\n.ex li>p{margin:0!important}\n.ex li>ul,.ex li>ol{margin:3px 0!important}\n.ex h1,.ex h2,.ex h3,.ex h4{font-size:1.05em;margin:10px 0 6px!important}\n.ex .tw{overflow-x:auto;margin:10px 0;-webkit-overflow-scrolling:touch}\n.ex table{border-collapse:collapse;width:100%;margin:0;font-size:inherit;background:#fff}\n.ex th,.ex td{border:1px solid #c9d3d8!important;padding:8px 10px!important;vertical-align:top;overflow-wrap:break-word}\n.ex th{background:#e4eef2;font-weight:700}\n.ex td>ul:first-child,.ex td>p:first-child,.ex td>ol:first-child{margin-top:0!important}\n.ex td>ul:last-child,.ex td>p:last-child,.ex td>ol:last-child{margin-bottom:0!important}\n.ex tr:first-child>td:only-child{font-weight:700}\n.q th,.q td{text-align:left}\n.page .ex p{color:inherit;font-size:inherit;line-height:inherit}\n\n/* Single-question practice: no clock, score summary or multi-question navigation. */\n#root>main{min-height:0;padding-bottom:24px}\n#root .qn-row .qn{display:inline-block;background:#98d8e8;color:#0d3d4a;font:700 12px/1 -apple-system,sans-serif;padding:6px 10px;border-radius:8px}\n#root>header{gap:10px}\n#root .brand{font-size:20px}\n#root main .opts{padding:12px 2px 16px;grid-template-columns:1fr 1fr}\n#root .opt{width:100%;align-items:center;flex-wrap:wrap;}\n#root .opt .choice-text{flex:1;min-width:0}\n#root .opt .choice-text p{margin:0}\n#root .opt .choice-mark{flex-basis:100%;font-size:12px;min-height:0;line-height:1.35;font-weight:700}\n#root .opt .choice-mark:empty{display:none}\n#root .opt:disabled{cursor:default;opacity:1;color:var(--ink)}\n#root .opt.ok{background:#e7f6ee;border-color:var(--ok)}\n#root .opt.no{background:#fbeae8;border-color:var(--bad)}\n#root .opt.ok .choice-mark{color:#166b45}\n#root .opt.no .choice-mark{color:#a52e24}\n#root .ex{margin-top:16px}\n#root .ex[hidden],#root .btn[hidden]{display:none!important}\n#root .ex h2{font-size:16px;margin:12px 0 8px;text-align:left}\n#root .ex-content p{font-size:inherit;line-height:inherit}\n#root .answer-result{font-size:15px;font-weight:700;padding-bottom:10px;border-bottom:1px solid #d6e1e5}\n#root .answer-result.is-correct{color:#166b45}\n#root .answer-result.is-incorrect{color:#a52e24}\n#root>.nav{padding:12px 20px 14px;justify-content:space-between}\n/* Review mode (after answering): options restack in a single column inside the page flow */\n#root.answered .opts{display:block;padding:4px 0 10px}\n#root #savedState{flex:1 1 220px;margin:0;font:13px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;color:var(--mut)}\n#root .q img,#root .ex img{max-width:100%;cursor:default}\n@media(max-width:640px){#root main .opts{grid-template-columns:1fr}}\n/* Single-question answer feedback: options fade out, then the review fades in; the question block is never part of it. */\n#root.mw-leave .opts{opacity:0;transition:opacity .25s ease}\n#root.mw-enter .opts,#root.mw-enter .ex{animation:mwFadeIn .25s ease both}\n@keyframes mwFadeIn{from{opacity:0}to{opacity:1}}\n@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}\n";
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const codeOf = value => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const validCode = code => /^[A-Z]{1,8}\d{1,14}$/.test(code);
  const validQuestion = q => q && validCode(q.code) && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4 && /^[a-f0-9]{24}$/.test(q.signature);
  const answerKey = q => ANSWER_PREFIX + q.code + '.' + q.signature;
  function readAnswer(q) {
    try { const value = JSON.parse(localStorage.getItem(answerKey(q))); return value && value.signature === q.signature && Number.isInteger(value.selected) && value.selected >= 0 && value.selected < 4 ? value : null; }
    catch { return null; }
  }
  function saveAnswer(q, selected) {
    if (!validQuestion(q) || !Number.isInteger(selected) || selected < 0 || selected > 3) throw new Error('Invalid answer.');
    const value = {code:q.code, signature:q.signature, selected, answeredAt:Date.now()};
    localStorage.setItem(answerKey(q), JSON.stringify(value)); return value;
  }
  function clearAnswer(q) { localStorage.removeItem(answerKey(q)); }
  function clearAnswers() {
    const keys = []; for (let i=0;i<localStorage.length;i++) { const key=localStorage.key(i); if(key?.startsWith(ANSWER_PREFIX)) keys.push(key); }
    keys.forEach(key=>localStorage.removeItem(key)); return keys.length;
  }
  let dbPromise = null;
  const Cache = {
    open() {
      if (!dbPromise) dbPromise = new Promise((resolve,reject) => {
        const request=indexedDB.open(DB_NAME,1);
        request.onupgradeneeded=()=>request.result.createObjectStore('questions',{keyPath:'code'});
        request.onsuccess=()=>resolve(request.result); request.onerror=()=>{dbPromise=null;reject(request.error)};
      }); return dbPromise;
    },
    async get(code) { const db=await this.open();return new Promise((resolve,reject)=>{const r=db.transaction('questions').objectStore('questions').get(code);r.onsuccess=()=>resolve(validQuestion(r.result)?r.result:null);r.onerror=()=>reject(r.error)}) },
    async put(q) { const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('questions','readwrite');tx.objectStore('questions').put(q);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Question cache transaction aborted'))}) },
    async clear() { const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('questions','readwrite');tx.objectStore('questions').clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Question cache transaction aborted'))}) }
  };
  let indexPromise=null;
  async function loadIndex(signal) {
    if (!indexPromise) indexPromise=fetch(INDEX_URL,{cache:'no-cache',signal}).then(async response=>{
      if(!response.ok)throw new Error('Question index is unavailable. Upload assets/mcq-question-index.json with this update.');
      const data=await response.json();
      if(data.schema!==1||!Array.isArray(data.topics)||!data.questions||typeof data.source?.base!=='string'||!data.source.base.startsWith('https://raw.githubusercontent.com/'))throw new Error('The question index is not valid.');
      return data;
    }).catch(error=>{indexPromise=null;throw error});
    return indexPromise;
  }
  const ALLOWED_TAGS = new Set('P BR DIV SPAN B STRONG I EM U S SUB SUP UL OL LI TABLE THEAD TBODY TFOOT TR TD TH CAPTION COLGROUP COL H1 H2 H3 H4 H5 H6 IMG A HR BLOCKQUOTE PRE CODE DL DT DD FIGURE FIGCAPTION'.split(' '));
  const REMOVE_TAGS = new Set('SCRIPT STYLE IFRAME FRAME FRAMESET OBJECT EMBED LINK META BASE FORM INPUT TEXTAREA SELECT BUTTON SVG MATH'.split(' '));
  const STYLE_KILL=/^(text-align.*|direction|unicode-bidi|text-indent|margin.*|padding.*|float|position|left|right|top|bottom|width|min-width|max-width|height|min-height|max-height|line-height|white-space|font-size|font-family|letter-spacing|word-spacing|display|flex.*|justify.*|align.*|transform.*|overflow.*|zoom|writing-mode|column.*|background-image|content|filter|clip.*)$/;
  const ALLOWED_ATTR = new Set(['class','style','title','colspan','rowspan','alt','src','href','width','height','scope']);
  function safeUrl(value, image=false) {
    const text=String(value||'').trim();
    if(image&&/^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i.test(text))return text;
    try { const url=new URL(text); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch { return ''; }
  }
  function richHtml(value) {
    // Template parsing is inert: source images do not load in the library before the reader's network policy is applied.
    const template=document.createElement('template');template.innerHTML=String(value??'');
    for(const el of [...template.content.querySelectorAll('*')]) {
      if(REMOVE_TAGS.has(el.tagName)){el.remove();continue}
      if(!ALLOWED_TAGS.has(el.tagName)){el.replaceWith(...el.childNodes);continue}
      for(const attr of [...el.attributes])if(!ALLOWED_ATTR.has(attr.name.toLowerCase()))el.removeAttribute(attr.name);
      if(el.hasAttribute('style')){
        const style=el.style,remove=[];
        for(let i=0;i<style.length;i++)if(STYLE_KILL.test(style[i])||/url\s*\(|expression\s*\(|javascript:/i.test(style.getPropertyValue(style[i])))remove.push(style[i]);
        remove.forEach(name=>style.removeProperty(name));if(!style.cssText)el.removeAttribute('style');
      }
      if(el.tagName==='IMG') {const src=safeUrl(el.getAttribute('src'),true);if(!src){el.remove();continue}el.setAttribute('src',src);el.setAttribute('referrerpolicy','no-referrer');el.setAttribute('loading','lazy');}
      if(el.tagName==='A'){const href=safeUrl(el.getAttribute('href'));if(href){el.setAttribute('href',href);el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer')}else el.removeAttribute('href')}
    }
    for(const table of template.content.querySelectorAll('table'))if(!table.parentElement?.classList.contains('tw')){const wrap=document.createElement('div');wrap.className='tw';table.replaceWith(wrap);wrap.appendChild(table)}
    return template.innerHTML;
  }
  function withImages(html, images) {
    let result=richHtml(html);const seen=new Set();const t=document.createElement('template');t.innerHTML=result;t.content.querySelectorAll('img').forEach(img=>seen.add(img.getAttribute('src')));
    for(const image of Array.isArray(images)?images:[]) {
      const url=safeUrl(typeof image==='string'?image:image?.url??image?.src??image?.image_url,true);
      if(url&&!seen.has(url)){result+='<div class="img-wrap"><img src="'+esc(url)+'" alt="MCQ image" referrerpolicy="no-referrer" loading="lazy"></div>';seen.add(url)}
    }return result;
  }
  function normalize(raw, code, topic, signature) {
    if(codeOf(raw.question_id)!==code)throw new Error('The topic file did not contain the requested question code.');
    const choices=Array.isArray(raw.choices)?raw.choices:raw.options;
    if(!Array.isArray(choices)||choices.length!==4)throw new Error('This source record does not contain four options. No options have been invented or removed.');
    const options=choices.map(choice=>richHtml(choice?.text??choice?.option_text??choice?.html??choice??''));
    const answer=raw.correct_choice_id??raw.correctOptionId??raw.correct_answer??raw.answer;
    let correct=choices.findIndex(choice=>String(choice?.id??choice?.option_key??'')===String(answer));
    if(correct<0&&Number.isInteger(Number(answer))){const n=Number(answer);correct=n>=1&&n<=choices.length?n-1:n}
    if(correct<0||correct>=4)throw new Error('The source answer key is unavailable for this question.');
    const result={code,signature,question:withImages(raw.text??raw.question_text??raw.question_html??'',raw.question_images),options,correct,explanation:withImages(raw.solution??raw.explanation_html??raw.explanation??'',raw.explanation_images),subject:topic[0],topic:topic[1],sourcePath:topic[2]};
    if(!validQuestion(result))throw new Error('This source question could not be read.');return result;
  }
  // Public, pinned QBank Hub staging artifact. Only missing codes are indexed locally;
  // the question text stays at its original source and is fetched on first lookup.
  async function lookupHub(code, {signal, network}) {
    const response=await fetch(HUB_INDEX_URL,{cache:'no-cache',signal});
    if(!response.ok)throw new Error('The supplemental MCQ index is unavailable. Please reload online.');
    const index=await response.json(), hit=index.questions?.[code];
    if(index.schema!==1||index.source?.url!=='https://raw.githubusercontent.com/amrenkhan07-pixel/qbank-hub/cfb6dddbf0c4d760080792d953e0582e0e9e6ee7/import-reports/marrow-pyq-stage-v1.json.gz'||index.source?.sha256!=='c3ee2697542afacd49d3931c71ec05f010190394dd2196252ff0c0efc132f76a')throw new Error('The supplemental MCQ index is invalid.');
    if(!hit)throw new Error('No MCQ was found for '+code+'. Check the exact code, including its letters and leading zeros.');
    if(!network)throw new Error('This MCQ is not downloaded yet. Turn Network access on in Settings, then search again.');
    if(navigator.onLine===false)throw new Error('This MCQ is not downloaded yet. Connect to the internet for the first lookup.');
    if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot open the QBank Hub compressed source. Please update your browser.');
    let artifact;
    try {
      const r=await fetch(index.source.url,{signal,referrerPolicy:'no-referrer'});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const bytes=await r.arrayBuffer();
      if(globalThis.crypto?.subtle){
        const digest=await crypto.subtle.digest('SHA-256',bytes);
        const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
        if(hash!==index.source.sha256)throw new Error('source checksum mismatch');
      }
      const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      artifact=JSON.parse(await new Response(stream).text());
    }catch(error){if(error.name==='AbortError')throw error;throw new Error('The QBank Hub question source could not be opened. Check your connection or try a current browser.');}
    const version=artifact.content_versions?.[hit[0]], payload=version?.payload;
    if(!version||codeOf(version.source_question_id_first_seen)!==code||version.content_sha256!==hit[3]||!Array.isArray(payload?.correct_keys)||payload.correct_keys.length!==1)
      throw new Error('The QBank Hub source record does not match the index.');
    const images=placement=>(payload.media||[]).filter(m=>m.type==='image'&&m.placement===placement).sort((a,b)=>a.position-b.position).map(m=>m.reference);
    const raw={question_id:code,question_html:payload.question_html,choices:(payload.options||[]).map(o=>({id:o.key,html:o.html})),correct_choice_id:payload.correct_keys[0],explanation_html:payload.explanation_html,question_images:images('question'),explanation_images:images('explanation')};
    const question=normalize(raw,code,[hit[1],'PYQ · '+hit[2],'QBank Hub PYQ'],hit[3].slice(0,24));
    let cacheWarning=false;try {await Cache.put(question)}catch {cacheWarning=true}
    return {question,cached:false,cacheWarning};
  }
  async function lookup(code, {signal, network=true}={}) {
    try {const cached=await Cache.get(code);if(cached)return {question:cached,cached:true}}catch { /* Online lookup can still work if browser caching is unavailable. */ }
    const index=await loadIndex(signal),hits=index.questions[code];
    if(!hits?.length)return lookupHub(code,{signal,network});
    if(!network)throw new Error('This MCQ is not downloaded yet. Turn Network access on in Settings, then search again.');
    if(navigator.onLine===false)throw new Error('This MCQ is not downloaded yet. Connect to the internet for the first lookup.');
    // Preserve the existing QBank match for shared codes; PYQ-only codes point to their dedicated paper.
    // The index keeps the original QBank entry first so cached questions and remembered answers stay compatible.
    const hit=hits[0],topic=index.topics[hit[0]],prefixes=index.source.prefixes||[index.source.prefix];
    if(!topic||!Array.isArray(prefixes)||!prefixes.some(prefix=>typeof prefix==='string'&&topic[2].startsWith(prefix))||topic[2].split('/').includes('..'))throw new Error('The question location in the index is invalid.');
    const url=index.source.base+topic[2].split('/').map(encodeURIComponent).join('/');
    let response;
    try {response=await fetch(url,{cache:'force-cache',signal,referrerPolicy:'no-referrer'})}catch(error){if(error.name==='AbortError')throw error;throw new Error('The question database could not be reached. Check your connection and try again.')}
    if(!response.ok)throw new Error('The question database returned HTTP '+response.status+'. Please try again later.');
    const data=await response.json(),records=data.questions||[];
    const raw=codeOf(records[hit[1]]?.question_id)===code?records[hit[1]]:records.find(q=>codeOf(q.question_id)===code);
    if(!raw)throw new Error('That question was not found in its source topic file.');
    const question=normalize(raw,code,topic,hit[2]);let cacheWarning=false;
    try {await Cache.put(question)}catch {cacheWarning=true}
    return {question,cached:false,cacheWarning};
  }
  function frameRuntime(data) {
    'use strict';
    const buttons=[...document.querySelectorAll('[data-choice]')],ex=document.getElementById('explanation'),result=document.getElementById('answerResult'),saved=document.getElementById('savedState'),retry=document.getElementById('retryQuestion'),nextBtn=document.getElementById('nextBookmark');
    let selected=null,holdTimer=0,swapTimer=0,doneTimer=0;
    const send=(type,extra={})=>parent.postMessage({type,code:data.code,signature:data.signature,nonce:data.nonce,...extra},'*');
    /* Review mode: once the question is answered, the page switches to the review layout — the
       options restack in a single column (green = correct, red = your choice) and the explanation
       follows, all flowing from the top of the scrollable page like a full test's review screen.
       "Try again" returns to the unanswered layout. Pure class toggling — no DOM moves.
       The bookmark-review "Next" button is hidden until the explanation is revealed. */
    function reviewMode(on,keepScroll){
      const root=document.getElementById('root'),main=root&&root.querySelector('main');
      if(!root||!main)return;
      if(on){root.classList.add('answered');main.classList.add('rv')}
      else{root.classList.remove('answered');main.classList.remove('rv')}
      if(!keepScroll)main.scrollTop=0;
    }
    /* Answer feedback timeline (fresh answers only): the screen stays exactly as it is while the
       option boxes change colour (0.80s), then the options fade out and the review fades in
       (0.25s + 0.25s = 0.50s). Only the area under the question takes part: the question block is
       never touched, so its text keeps its position, size and colour. A remembered answer that is
       restored when the page opens goes straight to the review without any delay. */
    function showReview(animated,keepScroll){
      const root=document.getElementById('root');
      ex.hidden=false;retry.hidden=false;if(nextBtn){nextBtn.hidden=false;nextBtn.disabled=false}
      reviewMode(true,keepScroll);
      if(animated&&root){root.classList.add('mw-enter');doneTimer=setTimeout(()=>root.classList.remove('mw-enter'),260)}
    }
    function clearTimers(){
      clearTimeout(holdTimer);clearTimeout(swapTimer);clearTimeout(doneTimer);
      const root=document.getElementById('root');
      if(root)root.classList.remove('mw-leave','mw-enter');
    }
    function reveal(index,previous=false){
      clearTimers();
      selected=index;buttons.forEach((button,i)=>{button.disabled=true;button.classList.toggle('ok',i===data.correct);button.classList.toggle('no',i===index&&i!==data.correct);button.setAttribute('aria-pressed',String(i===index));const mark=button.querySelector('.choice-mark');mark.textContent=i===data.correct?(i===index?'✓ Your answer · correct':'✓ Correct answer'):(i===index?'✗ Your answer':'')});
      const correct=index===data.correct;result.className='answer-result '+(correct?'is-correct':'is-incorrect');result.textContent=(correct?'Correct. You chose ':'Incorrect. You chose ')+String.fromCharCode(65+index)+'.'+(correct?'':' The correct answer is '+String.fromCharCode(65+data.correct)+'.');
      saved.textContent=previous?'Your previous answer is shown.':'Remembering your answer…';
      if(previous){showReview(false,false);return}
      holdTimer=setTimeout(()=>{
        const root=document.getElementById('root');
        const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
        if(calm||!root){showReview(false,true);return}
        root.classList.add('mw-leave');
        swapTimer=setTimeout(()=>{root.classList.remove('mw-leave');showReview(true,true)},250);
      },1000);
    }
    function reset(){clearTimers();selected=null;buttons.forEach(button=>{button.disabled=false;button.classList.remove('ok','no');button.setAttribute('aria-pressed','false');button.querySelector('.choice-mark').textContent=''});ex.hidden=true;retry.hidden=true;if(nextBtn){nextBtn.hidden=true;nextBtn.disabled=false}saved.textContent='Choose one option. Your answer will be remembered on this device.';reviewMode(false);buttons[0]?.focus()}
    buttons.forEach((button,index)=>button.addEventListener('click',()=>{if(selected!==null)return;reveal(index);send('prohtml-mcq-answer',{selected:index})}));
    retry.addEventListener('click',()=>{retry.disabled=true;send('prohtml-mcq-reset')});
    if(nextBtn)nextBtn.addEventListener('click',()=>{if(nextBtn.hidden||nextBtn.disabled)return;nextBtn.disabled=true;send('prohtml-bookmark-next')});
    addEventListener('message',event=>{const m=event.data;if(event.source!==parent||!m||m.nonce!==data.nonce)return;if(m.type==='prohtml-mcq-saved')saved.textContent=m.ok?'Answer remembered on this device.':'Could not remember this answer. Keep this view open or enable browser storage.';if(m.type==='prohtml-mcq-reset-done'){retry.disabled=false;if(nextBtn)nextBtn.disabled=false;if(m.ok)reset();else saved.textContent='The previous answer could not be cleared. Check browser storage.'}if(m.type==='prohtml-bookmark-next-failed'){if(nextBtn)nextBtn.disabled=false;saved.textContent='Could not open the next bookmark.'}});
    addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();send('prohtml-mcq-close')}});
    /* A bookmarked question must wait for a fresh option click, even if a
       previous answer is remembered on this device. Code search keeps its
       remembered-answer restore. */
    if(Number.isInteger(data.previous)&&!data.bookmarkNav)reveal(data.previous,true);
    // Images remain constrained to the page; native reader controls provide font/zoom/display actions.
  }
  function buildHTML(question, nonce, bookmarkNav) {
    /* Do not surface a remembered answer when reviewing bookmarks: Try again
       and Next must stay hidden until the user answers again. */
    const prior=bookmarkNav?null:readAnswer(question);
    const data={code:question.code,signature:question.signature,correct:question.correct,nonce,previous:prior?prior.selected:null,bookmarkNav:bookmarkNav||null};
    const options=question.options.map((html,i)=>'<button class="opt" data-choice="'+i+'" aria-pressed="false"><span class="l">'+String.fromCharCode(65+i)+')</span><span class="choice-text">'+html+'</span><span class="choice-mark"></span></button>').join('');
    const script='('+frameRuntime.toString()+')('+JSON.stringify(data).replace(/</g,'\\u003c')+');';
    /* Expose the question to the Reader's injected bookmark runtime. Visual layout is untouched. */
    const meta='window.__PROHTML_MCQ__='+JSON.stringify({code:question.code,subject:question.subject,topic:question.topic,question:question.question,options:question.options,correct:question.correct,explanation:question.explanation}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')+';';
    /* Reference question layout: <main> is the scrollable area holding the question AND the
       options (the question block grows, so the options sit low on screen when content is short
       and scroll into view when an image makes it tall), while the button row stays pinned at the
       bottom. Once answered, reviewMode() restyles the same page as a review screen. */
    const nextLabel=bookmarkNav?(bookmarkNav.hasNext?'Next':'Back to bookmarks'):'';
    const nextBtn=bookmarkNav?'<button class="btn'+(bookmarkNav.hasNext?' pri':'')+'" id="nextBookmark" hidden aria-label="'+(bookmarkNav.hasNext?'Next bookmarked MCQ':'Back to bookmarks')+'">'+esc(nextLabel)+'</button>':'';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="no-referrer"><title>MCQ '+esc(question.code)+'</title><style>'+QUESTION_CSS+'</style></head><body><div id="root"><header><div class="brand">'+esc(question.code)+'</div><span class="sec-pill">Single-question practice</span></header><main><div class="qn-row"><div class="qn">'+esc(question.subject)+' · '+esc(question.topic)+'</div></div><div class="q">'+question.question+'</div><div class="opts">'+options+'</div><section class="ex" id="explanation" hidden><div id="answerResult" class="answer-result" role="status" aria-live="polite"></div><h2>Explanation</h2><div class="ex-content">'+(question.explanation||'<p>The source does not provide an explanation for this question.</p>')+'</div></section></main><div class="nav"><p id="savedState" role="status" aria-live="polite">Choose one option. Your answer will be remembered on this device.</p><button class="btn" id="retryQuestion" hidden>Try again</button>'+nextBtn+'</div></div><script>'+meta+script+'<\/script></body></html>';
  }
  function create(options) {
    const overlay=document.createElement('div');overlay.id='mcqSearchOverlay';overlay.hidden=true;
    overlay.innerHTML='<div class="mcq-search-backdrop" aria-hidden="true"></div><section class="mcq-search-panel" role="dialog" aria-modal="true" aria-labelledby="mcqSearchTitle"><div class="mcq-search-heading"><div><p class="eyebrow">QUESTION LOOKUP</p><h2 id="mcqSearchTitle">Find an MCQ by code</h2></div><button class="mcq-search-close" type="button" aria-label="Close MCQ search">×</button></div><form id="mcqSearchForm"><label for="mcqCode">Question code</label><div class="mcq-search-entry"><input id="mcqCode" name="code" type="text" placeholder="e.g. MB1838 or MA2593" maxlength="24" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="mcqSearchStatus mcqSearchHint"><button id="mcqFind" type="submit">Find MCQ</button></div></form><p id="mcqSearchStatus" role="status" aria-live="polite"></p><p id="mcqSearchHint">Search QBank and coded PYQs. First-time lookup needs internet; your answer stays on this device.</p></section>';
    document.body.appendChild(overlay);
    const panel=overlay.querySelector('.mcq-search-panel'),input=overlay.querySelector('#mcqCode'),form=overlay.querySelector('form'),status=overlay.querySelector('#mcqSearchStatus'),submit=overlay.querySelector('#mcqFind');
    let anchor=null,restore=null,abort=null,request=0,inertBefore=[],busy=false,lastCode='';
    function position(){
      if(overlay.hidden)return;if(anchor&&!anchor.isConnected){anchor=document.getElementById('mcqSearchButton');anchor?.setAttribute('aria-expanded','true')}const vv=window.visualViewport,v={left:vv?.offsetLeft||0,top:vv?.offsetTop||0,width:vv?.width||innerWidth,height:vv?.height||innerHeight},margin=12;
      const width=Math.min(390,Math.max(220,v.width-2*margin));panel.style.width=width+'px';panel.style.maxHeight=Math.max(100,v.height-2*margin)+'px';
      const a=anchor?.isConnected?anchor.getBoundingClientRect():null;const height=Math.min(panel.scrollHeight,v.height-2*margin);
      let left=a?a.right-width:v.left+(v.width-width)/2,top=a?a.bottom+10:v.top+margin;
      if(top+height>v.top+v.height-margin&&a&&a.top-height-10>=v.top+margin)top=a.top-height-10;
      left=Math.max(v.left+margin,Math.min(left,v.left+v.width-width-margin));top=Math.max(v.top+margin,Math.min(top,v.top+v.height-height-margin));
      panel.style.left=left+'px';panel.style.top=top+'px';
    }
    function close({restoreFocus=true}={}){
      if(overlay.hidden)return;anchor?.setAttribute?.('aria-expanded','false');request++;abort?.abort();abort=null;busy=false;submit.disabled=false;overlay.hidden=true;
      for(const [el,value,aria] of inertBefore){el.inert=value;if(aria===null)el.removeAttribute('aria-hidden');else el.setAttribute('aria-hidden',aria)}inertBefore=[];
      if(restoreFocus){const target=restore?.isConnected?restore:document.getElementById('mcqSearchButton');target?.focus({preventScroll:true})}
    }
    function open(element){
      anchor=element?.currentTarget||element?.element||element;restore=anchor;anchor?.setAttribute?.('aria-expanded','true');
      if(!overlay.hidden){input.focus();return}
      options.beforeOpen?.();status.textContent='';status.className='';input.value=lastCode;
      inertBefore=[document.getElementById('home'),document.getElementById('reader')].filter(Boolean).map(el=>[el,el.inert,el.getAttribute('aria-hidden')]);inertBefore.forEach(([el])=>{el.inert=true;el.setAttribute('aria-hidden','true')});
      overlay.hidden=false;position();input.focus({preventScroll:true});input.select();requestAnimationFrame(position);
    }
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;const code=codeOf(input.value);input.value=code;
      if(!validCode(code)){status.textContent='Enter a question code such as MB1838 or MA2593.';status.className='is-error';input.focus();position();return}
      const id=++request;abort=new AbortController();busy=true;submit.disabled=true;status.className='';status.textContent='Finding '+code+'…';position();
      try {
        const result=await lookup(code,{signal:abort.signal,network:options.networkAllowed?options.networkAllowed():true});
        if(id!==request||overlay.hidden)return;lastCode=code;close({restoreFocus:false});
        await options.onOpen(result.question);if(result.cacheWarning)options.toast?.('Opened MCQ. Browser storage could not keep an offline copy.');
      }catch(error){if(id!==request||overlay.hidden||error.name==='AbortError')return;status.className='is-error';status.textContent=error.message||'This MCQ could not be opened.';input.focus();input.select();position()}
      finally{if(id===request){busy=false;submit.disabled=false;abort=null}}
    });
    overlay.querySelector('.mcq-search-close').onclick=()=>close();overlay.querySelector('.mcq-search-backdrop').onclick=()=>close();
    overlay.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return}
      if(event.key==='Tab'){const focusable=[...panel.querySelectorAll('button,input')].filter(el=>!el.disabled);const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
    },true);
    window.addEventListener('resize',position,{passive:true});window.visualViewport?.addEventListener('resize',position,{passive:true});window.visualViewport?.addEventListener('scroll',position,{passive:true});
    const message=event=>{
      const active=options.getActive?.(),frame=options.getFrame?.(),data=event.data;
      if(!active||!frame||event.source!==frame.contentWindow||!data||data.code!==active.question.code||data.signature!==active.question.signature||data.nonce!==active.nonce)return;
      const reply=value=>frame.contentWindow.postMessage({...value,nonce:active.nonce},'*');
      if(data.type==='prohtml-mcq-answer'){
        let ok=false;try{saveAnswer(active.question,data.selected);ok=true}catch{options.toast?.('Could not remember your answer. Browser storage may be full or blocked.')}
        reply({type:'prohtml-mcq-saved',ok});
      }else if(data.type==='prohtml-mcq-reset'){
        let ok=false;try{clearAnswer(active.question);ok=true}catch{options.toast?.('The saved answer could not be cleared.')}
        reply({type:'prohtml-mcq-reset-done',ok});
      }else if(data.type==='prohtml-bookmark-next'){
        let ok=false;
        try{
          const cb=options.onNextBookmark;
          if(cb){const result=cb();ok=!result||result.action!=='none'}
        }catch{options.toast?.('Could not open the next bookmark.')}
        if(!ok)try{reply({type:'prohtml-bookmark-next-failed'})}catch{}
      }else if(data.type==='prohtml-mcq-close')options.onCloseQuestion?.();
    };
    window.addEventListener('message',message);
    return {open,close,get isOpen(){return !overlay.hidden},buildHTML,clearAnswers,clearCache:()=>Cache.clear(),readAnswer};
  }
  window.ProMCQSearch=Object.freeze({create,codeOf,buildHTML});
})();
