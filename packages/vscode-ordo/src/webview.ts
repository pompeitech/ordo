// Assets of the full-page Ordo view. The client is a plain script that runs under a
// nonce-based CSP: no inline handlers, no external resources, all text escaped.

export const pageStyles = `
:root{color-scheme:light dark;font-family:var(--vscode-font-family);color:var(--vscode-foreground);--nav:232px}
*{box-sizing:border-box}
body{margin:0;background:var(--vscode-editor-background);font-size:13px}
button,select,input{font:inherit;color:inherit}
button{cursor:pointer}
code{font-family:var(--vscode-editor-font-family);font-size:12px}
.layout{display:grid;grid-template-columns:var(--nav) minmax(0,1fr);min-height:100vh}
.layout>*,.page{min-width:0}
.nav{position:sticky;top:0;height:100vh;overflow:auto;padding:20px 12px;background:var(--vscode-sideBar-background);border-right:1px solid var(--vscode-sideBar-border,var(--vscode-panel-border))}
.brand{padding:0 10px 18px}
.brand strong{display:block;font-size:17px}
.brand span{display:block;margin-top:2px;font-size:12px;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.group{margin:14px 10px 6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--vscode-descriptionForeground)}
.navitem{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:7px 10px;margin:1px 0;border:0;border-radius:5px;background:transparent;text-align:left}
.navitem:hover{background:var(--vscode-list-hoverBackground)}
.navitem.active{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground);box-shadow:inset 3px 0 0 var(--vscode-focusBorder)}
.navitem .count{font-size:11px;color:var(--vscode-descriptionForeground)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--vscode-descriptionForeground)}
.dot.ok{background:var(--vscode-charts-green)}.dot.warn{background:var(--vscode-charts-yellow)}.dot.bad{background:var(--vscode-charts-red)}
.content{min-width:0;padding:28px clamp(16px,3vw,40px) 120px}
.page{max-width:1180px;margin:0 auto}
.top{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px 16px;margin-bottom:20px}
.top>div:first-child{flex:1 1 320px;min-width:0}
.top p{max-width:78ch}
h1{font-size:22px;margin:0 0 6px}
h2{font-size:14px;margin:0 0 10px}
.muted{color:var(--vscode-descriptionForeground)}
.small{font-size:12px}
.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.primary,.secondary{border-radius:4px;padding:6px 12px;border:1px solid var(--vscode-button-border,transparent)}
.primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.primary:hover{background:var(--vscode-button-hoverBackground)}
.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.secondary:hover{background:var(--vscode-button-secondaryHoverBackground)}
.card{border:1px solid var(--vscode-panel-border);border-radius:6px;padding:16px;background:var(--vscode-editorWidget-background)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:16px;margin:16px 0;align-items:start}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr));gap:12px;margin:20px 0}
.stat{border:1px solid var(--vscode-panel-border);border-radius:6px;padding:14px;background:var(--vscode-editorWidget-background);text-align:left}
.stat:hover{border-color:var(--vscode-focusBorder)}
.stat strong{display:block;font-size:24px}
.stat span{font-size:12px;color:var(--vscode-descriptionForeground)}
.list{border:1px solid var(--vscode-panel-border);border-radius:6px;overflow:hidden}
.entry{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;width:100%;padding:12px 16px;border:0;border-bottom:1px solid var(--vscode-panel-border);background:transparent;text-align:left}
.entry:last-child{border-bottom:0}
.entry:hover{background:var(--vscode-list-hoverBackground)}
.entry strong{display:block}
.entry .sub{display:block;margin-top:3px;font-size:12px;color:var(--vscode-descriptionForeground)}
.pill{font-size:11px;padding:2px 8px;border-radius:10px;border:1px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);white-space:nowrap}
.section{margin-top:28px}
.empty{padding:28px;text-align:center;color:var(--vscode-descriptionForeground);border:1px dashed var(--vscode-panel-border);border-radius:6px}
.banner{border-left:3px solid var(--vscode-editorWarning-foreground);padding:10px 12px;margin:0 0 16px;background:var(--vscode-editorWidget-background)}
.banner.error{border-left-color:var(--vscode-errorForeground)}
.banner ul{margin:6px 0 0;padding-left:18px}
.badge{font-size:11px;padding:2px 8px;border-radius:10px;white-space:nowrap;border:1px solid currentColor}
.badge.connected{color:var(--vscode-charts-green)}.badge.not-authenticated{color:var(--vscode-charts-yellow)}.badge.not-found{color:var(--vscode-charts-red)}
.detail{display:block;font-size:12px;color:var(--vscode-descriptionForeground);margin-top:6px;overflow-wrap:anywhere}
.card .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.session{display:grid;grid-template-columns:110px 1fr;gap:8px 12px;font-size:12px;margin:0}
.session dt{color:var(--vscode-descriptionForeground)}
.session dd{margin:0}
.chip{display:inline-block;padding:1px 8px;margin:0 4px 4px 0;border-radius:10px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);font-size:11px}
.tabs{display:flex;gap:4px;margin:24px 0 12px;border-bottom:1px solid var(--vscode-panel-border)}
.tab{background:transparent;border:0;border-bottom:2px solid transparent;padding:8px 14px;color:var(--vscode-descriptionForeground)}
.tab.active{color:var(--vscode-foreground);border-bottom-color:var(--vscode-focusBorder)}
.tab .count{font-size:11px;margin-left:6px}
.toolbar{display:flex;gap:12px;align-items:center;margin-bottom:8px}
.toolbar input{flex:1;padding:6px 8px;border-radius:4px;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));background:var(--vscode-input-background)}
.legend{font-size:12px;color:var(--vscode-descriptionForeground);margin:0 0 8px}
.legend b{color:var(--vscode-foreground);font-weight:600}
.item{display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,200px);gap:12px;align-items:center;padding:10px 12px;border-radius:5px;border:1px solid transparent}
.item:hover{background:var(--vscode-list-hoverBackground)}
.item.pending{border-color:var(--vscode-focusBorder);background:var(--vscode-list-inactiveSelectionBackground)}
.item.off .name{color:var(--vscode-descriptionForeground)}
.name{font-weight:600;background:none;border:0;padding:0;text-align:left}
.name:hover{text-decoration:underline}
.desc{font-size:12px;color:var(--vscode-descriptionForeground);margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.flag{font-size:10px;padding:1px 6px;border-radius:8px;border:1px solid currentColor;margin-left:6px;font-weight:400}
.flag.changed{color:var(--vscode-editorWarning-foreground)}
.flag.missing{color:var(--vscode-errorForeground)}
select{width:100%;padding:5px 6px;border-radius:4px;border:1px solid var(--vscode-dropdown-border);background:var(--vscode-dropdown-background)}
.accept{margin-top:6px;width:100%;font-size:11px;padding:3px 6px}
.spread{display:flex;justify-content:space-between;align-items:center;gap:8px}
.agent{margin-top:14px;padding-top:12px;border-top:1px solid var(--vscode-panel-border)}
.agent:first-of-type{border-top:0;padding-top:0}
.meter{margin-top:10px}
.meter-head{display:flex;justify-content:space-between;font-size:12px}
.track{height:6px;margin-top:4px;border-radius:3px;overflow:hidden;background:var(--vscode-panel-border)}
.fill{height:100%;width:0;border-radius:3px;background:var(--vscode-charts-green)}
.fill.warn{background:var(--vscode-charts-yellow)}.fill.bad{background:var(--vscode-charts-red)}
.meter-foot{display:block;margin-top:3px;font-size:11px;color:var(--vscode-descriptionForeground)}
.suggestion{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:8px 0;border-top:1px solid var(--vscode-panel-border)}
.suggestion:first-of-type{border-top:0}
.suggestion .why{display:block;font-size:12px;color:var(--vscode-descriptionForeground);margin-top:2px}
.kindchip{font-size:10px;text-transform:uppercase;letter-spacing:.05em;padding:2px 6px;border-radius:4px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.pipeline{border:1px solid var(--vscode-panel-border);border-radius:6px;overflow:auto}
.pipeline table{border-collapse:collapse;width:100%;min-width:620px}
.pipeline th{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:var(--vscode-descriptionForeground);text-align:center;padding:8px 4px;border-bottom:1px solid var(--vscode-panel-border)}
.pipeline th.name{text-align:left;padding-left:14px}
.pipeline td{padding:8px 4px;border-bottom:1px solid var(--vscode-panel-border);text-align:center;vertical-align:middle}
.pipeline tr.req{cursor:pointer}
.pipeline tr.req:hover td{background:var(--vscode-list-hoverBackground)}
.pipeline tr.req.selected td{background:var(--vscode-list-inactiveSelectionBackground)}
.pipeline td.name{text-align:left;padding-left:14px}
.pipeline td.name strong{display:block}
.pipeline td.name span{font-size:11px;color:var(--vscode-descriptionForeground)}
.pipeline tr.reqdetail td{text-align:left;padding:4px 14px 12px;font-size:12px;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-panel-border)}
.pipeline tr.reqdetail .spread{flex-wrap:wrap;justify-content:flex-start;gap:6px 14px}
.pipeline tr.reqdetail button{white-space:nowrap;flex:none}
.cell{display:inline-flex;width:26px;height:26px;border-radius:50%;align-items:center;justify-content:center;font-size:13px;border:1px solid var(--vscode-panel-border)}
.cell.done{background:var(--vscode-charts-green);color:var(--vscode-editor-background);border-color:transparent}
.cell.in-progress{border:2px solid var(--vscode-charts-blue);color:var(--vscode-charts-blue)}
.cell.blocked{background:var(--vscode-charts-red);color:var(--vscode-editor-background);border-color:transparent}
.cell.not-started{color:var(--vscode-descriptionForeground)}
.cell.skipped,.cell.unavailable{opacity:.45}
.flow{display:flex;align-items:stretch;gap:0;margin:16px 0 12px;overflow-x:auto;padding-bottom:4px}
.node{flex:1 0 96px;min-width:96px;border:1px solid var(--vscode-panel-border);border-radius:6px;padding:8px;text-align:center;background:var(--vscode-editorWidget-background);opacity:.4;transition:opacity .2s,border-color .2s}
.node.reached{opacity:1}
.node.now{border:2px solid var(--vscode-focusBorder);opacity:1}
.node.unavailable{border-style:dashed}
.node strong{display:block;font-size:12px}
.node span{display:block;font-size:11px;color:var(--vscode-descriptionForeground);margin-top:2px}
.arrow{align-self:center;padding:0 4px;color:var(--vscode-descriptionForeground)}
.controls{display:flex;align-items:center;gap:8px;margin:8px 0 14px}
.controls input[type=range]{flex:1}
.controls .label{font-size:12px;color:var(--vscode-descriptionForeground);white-space:nowrap;text-align:right}
.iconbtn{border:1px solid var(--vscode-button-border,transparent);background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border-radius:4px;width:30px;height:28px}
.filters{display:flex;gap:6px;margin-bottom:8px}
.filters button{border:1px solid var(--vscode-panel-border);background:transparent;border-radius:12px;padding:2px 10px;font-size:12px}
.filters button.active{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-color:transparent}
.timeline{list-style:none;margin:0;padding:0;border-left:2px solid var(--vscode-panel-border);margin-left:10px}
.tl{position:relative;padding:6px 0 10px 18px}
.tl::before{content:attr(data-icon);position:absolute;left:-12px;top:4px;width:22px;height:22px;border-radius:50%;background:var(--vscode-editor-background);text-align:center;font-size:13px;line-height:22px}
.tl.future{opacity:.3}
.tl.now .tlbody{border-color:var(--vscode-focusBorder)}
.tlbody{border:1px solid transparent;border-radius:6px;padding:6px 10px}
.tl.decision .tlbody{background:var(--vscode-editorWidget-background);border-color:var(--vscode-panel-border)}
.tl .when{font-size:11px;color:var(--vscode-descriptionForeground)}
.tl .what{display:block;margin-top:2px}
.tl.decision .what{font-weight:600}
.tl .sub{display:block;font-size:12px;color:var(--vscode-descriptionForeground);margin-top:2px}
.tokens{font-size:11px;padding:1px 7px;border-radius:9px;border:1px solid var(--vscode-panel-border);margin-left:6px;white-space:nowrap}
.tokens.top{border-color:var(--vscode-charts-orange);color:var(--vscode-charts-orange);font-weight:600}
.facts{display:flex;gap:18px;flex-wrap:wrap;font-size:12px;color:var(--vscode-descriptionForeground)}
.facts strong{color:var(--vscode-foreground)}
.panel{border-color:var(--vscode-focusBorder);margin:0 0 20px}
.panel h2{margin:0}
.panel .close{border:0;background:transparent;font-size:16px;color:var(--vscode-descriptionForeground)}
.files{margin:12px 0 4px;border:1px solid var(--vscode-panel-border);border-radius:6px}
.fileRow{display:grid;grid-template-columns:auto auto 1fr auto auto;gap:10px;align-items:center;padding:7px 10px;border-bottom:1px solid var(--vscode-panel-border)}
.fileRow:last-child{border-bottom:0}
.fileRow code{font-size:12px;overflow-wrap:anywhere}
.fileRow.undo code{text-decoration:line-through;color:var(--vscode-descriptionForeground)}
.fileRow .counts{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}
.chg{font-size:10px;font-weight:700;width:18px;height:18px;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;color:var(--vscode-editor-background)}
.chg.added{background:var(--vscode-charts-green)}.chg.modified{background:var(--vscode-charts-blue)}.chg.deleted{background:var(--vscode-charts-red)}
button.small{padding:2px 10px;font-size:12px}
.choices{display:flex;flex-direction:column;gap:6px;margin:14px 0 10px}
.choice{display:flex;gap:8px;align-items:flex-start;font-size:13px}
.choice span{color:var(--vscode-descriptionForeground);font-size:12px}
textarea{width:100%;min-height:64px;padding:8px;border-radius:4px;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));background:var(--vscode-input-background);color:var(--vscode-input-foreground);font:inherit;resize:vertical}
.panel .actions{justify-content:flex-end}
.harnesses{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 14px}
.harness{flex:1 1 200px;min-width:0;border:1px solid var(--vscode-panel-border);background:transparent;border-radius:6px;padding:10px 14px;text-align:left}
.harness strong{display:block}
.harness span{display:block;font-size:11px;color:var(--vscode-descriptionForeground);margin-top:3px}
.harness.active{border:2px solid var(--vscode-focusBorder);background:var(--vscode-list-inactiveSelectionBackground)}
.harness:disabled{opacity:.5;cursor:not-allowed}
.stack{display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--vscode-panel-border);margin:8px 0 6px}
.stack div{height:100%;width:0}
.seg0{background:var(--vscode-charts-blue)}.seg1{background:var(--vscode-charts-green)}.seg2{background:var(--vscode-charts-orange)}.seg3{background:var(--vscode-charts-purple)}
.legend span{display:inline-flex;align-items:center;gap:5px;margin-right:14px;font-size:12px;color:var(--vscode-descriptionForeground)}
.legend i{width:9px;height:9px;border-radius:2px;display:inline-block}
#run-output{max-height:340px;overflow:auto;background:var(--vscode-textCodeBlock-background);padding:10px 12px;border-radius:4px;white-space:pre-wrap;font-family:var(--vscode-editor-font-family);font-size:12px;margin:10px 0}
.approval{border-left:3px solid var(--vscode-editorWarning-foreground);padding:8px 12px;margin:8px 0;background:var(--vscode-editorWidget-background)}
.approval code{display:block;margin:4px 0;font-size:12px;overflow-wrap:anywhere}
.bar{position:fixed;left:var(--nav);right:0;bottom:0;border-top:1px solid var(--vscode-panel-border);background:var(--vscode-editorWidget-background);box-shadow:0 -4px 12px var(--vscode-widget-shadow)}
.bar .inner{max-width:1180px;margin:0 auto;padding:12px clamp(16px,3vw,40px);display:flex;flex-wrap:wrap;gap:12px 16px;align-items:flex-start;justify-content:space-between}
.layout.tall{height:100vh;min-height:0}
.layout.tall .content{height:100vh;display:flex;flex-direction:column;padding-bottom:16px;overflow:hidden}
.layout.tall .page{flex:1;min-height:0;display:flex;flex-direction:column;width:100%}
.top.compact{margin-bottom:14px}
.top.compact h1{margin-bottom:2px}
.chatwrap{flex:1;min-height:0;display:flex;container-type:inline-size}
.chat{flex:1;min-width:0;min-height:0;display:grid;grid-template-columns:clamp(190px,24%,280px) minmax(0,1fr);gap:16px}
.chatlist{display:flex;flex-direction:column;gap:2px;min-height:0;overflow:auto}
.chatlist .primary{margin-bottom:8px}
.chatitem{display:block;width:100%;text-align:left;border:0;background:transparent;border-radius:6px;padding:8px 10px}
.chatitem:hover{background:var(--vscode-list-hoverBackground)}
.chatitem.active{background:var(--vscode-list-inactiveSelectionBackground)}
.chatitem strong{display:block;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chatitem span{display:block;margin-top:2px;font-size:11px;color:var(--vscode-descriptionForeground)}
.conversation{display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--vscode-panel-border);border-radius:8px;overflow:hidden;background:var(--vscode-editor-background)}
.chathead{flex:none;display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editorWidget-background)}
.chathead .title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.chatpicker{display:none;flex:1;min-width:0;gap:6px}
.chatpicker select{flex:1;min-width:0;width:auto}
.segmented{flex:none;display:inline-flex;padding:2px;border-radius:6px;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--vscode-panel-border))}
.segmented button{border:0;border-radius:4px;background:transparent;padding:4px 10px;white-space:nowrap;color:var(--vscode-descriptionForeground)}
.segmented button.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.segmented button:disabled{opacity:.45;cursor:not-allowed}
.iconish{flex:none;border:0;background:transparent;color:var(--vscode-descriptionForeground);padding:4px 8px;border-radius:4px}
.iconish:hover{background:var(--vscode-list-hoverBackground);color:var(--vscode-foreground)}
.confirm{flex:none;display:flex;align-items:center;gap:6px;font-size:12px}
.handoff{flex:none;font-size:12px;color:var(--vscode-descriptionForeground);padding:6px 14px;border-bottom:1px solid var(--vscode-panel-border)}
#chat-messages{flex:1;min-height:0;overflow:auto;padding:18px clamp(12px,4%,40px)}
.thread{max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:18px}
.msg{min-width:0;line-height:1.55;overflow-wrap:anywhere}
.msg .who{display:block;font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:4px}
.msg.mine{align-self:flex-end;max-width:min(80%,620px);padding:8px 12px;border-radius:12px 12px 4px 12px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);white-space:pre-wrap}
.msg.mine .who{text-align:right}
.msg.reply{align-self:stretch}
.msg .err{display:block;margin-top:6px;padding:6px 10px;border-left:3px solid var(--vscode-errorForeground);font-size:12px;background:var(--vscode-editorWidget-background)}
.md>:first-child{margin-top:0}.md>:last-child{margin-bottom:0}
.md p{margin:0 0 8px}
.md h3,.md h4,.md h5{font-size:13px;margin:12px 0 6px}
.md ul,.md ol{margin:0 0 8px;padding-left:22px}
.md li{margin:2px 0}
.md code{font-family:var(--vscode-editor-font-family);font-size:12px;padding:1px 5px;border-radius:4px;background:var(--vscode-textCodeBlock-background)}
.md pre{margin:0 0 10px;padding:10px 12px;border-radius:6px;overflow:auto;background:var(--vscode-textCodeBlock-background)}
.md pre code{padding:0;background:none;white-space:pre}
.typing{color:var(--vscode-descriptionForeground)}
.welcome{max-width:560px;margin:8vh auto 0;text-align:center}
.welcome h2{font-size:16px;margin-bottom:6px}
.prompts{display:flex;flex-direction:column;gap:6px;margin-top:16px}
.prompts button{border:1px solid var(--vscode-panel-border);background:var(--vscode-editorWidget-background);border-radius:6px;padding:8px 12px;text-align:left}
.prompts button:hover{border-color:var(--vscode-focusBorder)}
.composer{flex:none;padding:10px clamp(10px,4%,40px) 8px;border-top:1px solid var(--vscode-panel-border);background:var(--vscode-editorWidget-background)}
.composerbox{max-width:860px;margin:0 auto;display:flex;align-items:flex-end;gap:8px;padding:6px 6px 6px 12px;border-radius:8px;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));background:var(--vscode-input-background)}
.composerbox:focus-within{border-color:var(--vscode-focusBorder)}
.composerbox textarea{flex:1;min-height:22px;max-height:200px;padding:4px 0;border:0;background:transparent;resize:none;outline:none;line-height:1.45}
.composer .hint{max-width:860px;margin:4px auto 0;font-size:11px;color:var(--vscode-descriptionForeground)}
@container (max-width:640px){
  .chat{grid-template-columns:minmax(0,1fr)}
  .chatlist{display:none}
  .chatpicker{display:flex}
  .chathead{flex-wrap:wrap}
  .chathead .title{display:none}
}
.bar ul{margin:4px 0 0;padding-left:18px;max-height:96px;overflow:auto;font-size:12px}
.bar .buttons{display:flex;gap:8px;flex-shrink:0}
@media (max-width:1000px){:root{--nav:188px}}
@media (max-width:720px){
  .layout{display:flex;flex-direction:column}
  .nav{position:sticky;top:0;z-index:5;height:auto;display:flex;flex-wrap:nowrap;gap:2px;overflow-x:auto;padding:6px 10px;border-right:0;border-bottom:1px solid var(--vscode-sideBar-border,var(--vscode-panel-border));scrollbar-width:none}
  .brand,.group{display:none}
  .navitem{width:auto;flex:none;white-space:nowrap;margin:0}
  .navitem.active{box-shadow:inset 0 -2px 0 var(--vscode-focusBorder)}
  .content{padding:18px 14px 120px}
  .layout.tall .content{flex:1;min-height:0;height:auto;padding-bottom:10px}
  .item{grid-template-columns:minmax(0,1fr)}
  .suggestion{grid-template-columns:auto minmax(0,1fr)}
  .suggestion>:last-child{grid-column:2;justify-self:start}
  .controls{flex-wrap:wrap}
  .bar{left:0}
}
`

export const pageClient = `
const vscode = acquireVsCodeApi();
const app = document.getElementById('app');
const saved = vscode.getState() || {};
const state = {
  tab: saved.tab || 'overview',
  profileKind: saved.profileKind || 'agents',
  query: '',
  snapshot: undefined,
  error: undefined,
  connections: undefined,
  profile: undefined,
  profileError: undefined,
  usage: undefined,
  suggestionsToQueue: undefined,
  workflow: undefined,
  workflowError: undefined,
  selectedKey: saved.selectedKey,
  trail: undefined,
  replayIndex: 0,
  replayFilter: 'all',
  playing: undefined,
  panel: undefined,
  pending: new Map(),
  chats: undefined,
  chatHarnesses: [],
  chat: undefined,
  chatId: saved.chatId,
  chatAgent: saved.chatAgent,
  chatDraft: '',
  chatPending: undefined,
  chatRunning: undefined,
  chatStream: '',
  chatError: undefined,
  confirmDelete: undefined
};
const DECISIONS = [
  ['approved', 'Approve', 'The step is done; kept files stay as the agent left them.'],
  ['changes-requested', 'Request changes', 'The step can run again; say what has to change.'],
  ['blocked', 'Block', 'Stop the step until the problem is solved; say why.']
];
const CHANGE_MARKS = { added: 'A', modified: 'M', deleted: 'D' };
const PHASES = ['brainstorm', 'spec', 'architect', 'plan', 'implement', 'verify', 'review', 'record'];
const STATE_MARKS = { 'done': '✓', 'in-progress': '◐', 'blocked': '✕', 'not-started': '', 'skipped': '–', 'unavailable': '·' };
const CATEGORY_ICONS = { decision: '👤', agent: '🤖', system: '⚙️', activity: '•' };
const NAV = [
  { group: 'Project', items: [['overview', 'Overview'], ['chat', 'Chat'], ['workflow', 'Workflow'], ['requirements', 'Requirements'], ['plans', 'Plans'], ['decisions', 'Decisions'], ['sessions', 'Sessions']] },
  { group: 'Configuration', items: [['profile', 'Team profile'], ['connections', 'AI connections']] }
];
const STATUS_LABELS = { 'connected': 'Connected', 'not-authenticated': 'Not logged in', 'not-found': 'Not found' };
const KIND_LABELS = { agents: 'Agents', skills: 'Skills', rules: 'Rules', workflows: 'Workflows' };
const MODE_LABELS = { required: 'Required', default: 'Default', recommended: 'Recommended', enabled: 'Available', disabled: 'Disabled' };
const MODES = ['required', 'default', 'recommended', 'enabled', 'disabled'];
const LEGENDS = {
  agents: '<b>Required</b> the only agent allowed · <b>Default</b> used when a session does not choose · <b>Recommended</b>/<b>Available</b> can be chosen · <b>Disabled</b> not allowed',
  skills: '<b>Required</b>/<b>Default</b> applied to every session · <b>Recommended</b> suggested · <b>Available</b> on request · <b>Disabled</b> not allowed',
  rules: '<b>Required</b>/<b>Default</b> applied to every session · <b>Recommended</b> suggested · <b>Available</b> on request · <b>Disabled</b> not allowed',
  workflows: 'Every workflow that is not <b>Disabled</b> is available to sessions'
};
const AGENT_NAMES = { 'claude-code': 'Claude Code', codex: 'Codex' };
const WINDOW_LABELS = { 'five-hour': '5-hour window', 'weekly': 'Weekly', 'weekly-opus': 'Weekly · Opus', 'weekly-sonnet': 'Weekly · Sonnet' };
const SOURCE_LABELS = { config: 'contentRoot from ordo.config.json', repository: 'content/ in this repository', bundled: 'catalog shipped with Ordo' };

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function send(type, data) { vscode.postMessage(Object.assign({ type: type }, data || {})); }
function persist() { vscode.setState({ tab: state.tab, profileKind: state.profileKind, selectedKey: state.selectedKey, chatId: state.chatId, chatAgent: state.chatAgent }); }
function plural(count, word) { return count + ' ' + word + (count === 1 ? '' : 's'); }

window.addEventListener('message', event => {
  const m = event.data;
  if (m.type === 'snapshot') { state.snapshot = m.snapshot; state.error = undefined; }
  else if (m.type === 'error') { state.error = m.message; }
  else if (m.type === 'connections') { state.connections = m.connections; }
  else if (m.type === 'usage') { state.usage = m.usage; }
  else if (m.type === 'workflow') {
    state.workflow = m.items; state.workflowError = undefined;
    const selected = selectedItem();
    if (selected && selected.specId) { send('loadTrail', { specId: selected.specId }); }
  }
  else if (m.type === 'workflowError') { state.workflowError = m.message; }
  else if (m.type === 'review') {
    state.panel = { kind: 'review', data: m.review, kept: new Set(m.review.files.map(f => f.path)), decision: 'approved', note: '', error: undefined, submitting: false };
    showPanel();
    return;
  }
  else if (m.type === 'reviewResult') {
    const p = state.panel;
    if (p && p.kind === 'review' && p.data.planId === m.planId && p.data.stepId === m.stepId) {
      if (m.ok) { state.panel = { kind: 'notice', text: 'Review of "' + m.stepId + '" recorded.' }; }
      else { p.error = m.message; p.submitting = false; }
      renderPanel();
    }
    return;
  }
  else if (m.type === 'runSetup') {
    const first = m.run.harnesses.find(h => h.connected);
    state.panel = { kind: 'run', setup: m.run, harness: first ? first.id : undefined, preview: undefined, prompt: '', phase: m.run.running ? 'busy' : 'setup', output: '', approvals: [], message: undefined };
    if (first && !m.run.running) { send('prepareRun', { planId: m.run.planId, stepId: m.run.stepId, specId: m.run.specId, harness: first.id }); }
    showPanel();
    return;
  }
  else if (m.type === 'runPreview') {
    const p = state.panel;
    if (p && p.kind === 'run' && p.harness === m.harness && p.setup.stepId === m.stepId) { p.preview = m; renderPanel(); }
    return;
  }
  else if (m.type === 'runStarted') {
    const p = state.panel;
    if (p && p.kind === 'run') { p.phase = 'running'; p.output = ''; renderPanel(); }
    return;
  }
  else if (m.type === 'runOutput') {
    const p = state.panel;
    if (p && p.kind === 'run') {
      p.output += m.text;
      const out = document.getElementById('run-output');
      if (out) {
        const atBottom = out.scrollTop + out.clientHeight >= out.scrollHeight - 20;
        out.textContent = p.output;
        if (atBottom) { out.scrollTop = out.scrollHeight; }
      }
    }
    return;
  }
  else if (m.type === 'runApproval') {
    const p = state.panel;
    if (p && p.kind === 'run') { p.approvals.push(m.approval); renderPanel(); }
    return;
  }
  else if (m.type === 'runFinished') {
    const p = state.panel;
    if (p && p.kind === 'run') { p.phase = 'done'; p.changedFiles = m.changedFiles; p.approvals = []; renderPanel(); }
    return;
  }
  else if (m.type === 'runFailed') {
    const p = state.panel;
    if (p && p.kind === 'run') { p.phase = 'failed'; p.message = (m.stopped ? 'Stopped. ' : '') + m.message; p.approvals = []; renderPanel(); }
    return;
  }
  else if (m.type === 'chats') {
    state.chats = m.chats; state.chatHarnesses = m.harnesses;
    if (m.running && !state.chatRunning) { state.chatRunning = m.running; }
    if (!state.chatAgent || !m.harnesses.some(h => h.id === state.chatAgent && h.connected)) {
      const first = m.harnesses.find(h => h.connected);
      if (first) { state.chatAgent = first.id; }
    }
    if (state.chatId && (!state.chat || state.chat.thread.id !== state.chatId)) {
      if (m.chats.some(c => c.id === state.chatId)) { send('openChat', { id: state.chatId }); }
      else if (state.chatRunning !== state.chatId) { state.chatId = undefined; state.chat = undefined; }
    }
    persist();
  }
  else if (m.type === 'chat') {
    if (m.chat.thread.id !== state.chatId) { return; }
    state.chat = m.chat;
  }
  else if (m.type === 'chatStarted') {
    state.chat = m.chat; state.chatId = m.chat.thread.id; state.chatRunning = m.chat.thread.id;
    state.chatPending = undefined; state.chatStream = ''; persist();
  }
  else if (m.type === 'chatOutput') {
    if (m.chatId !== state.chatRunning) { return; }
    state.chatStream += m.text;
    const stream = document.getElementById('chat-stream');
    if (stream) {
      const box = document.getElementById('chat-messages');
      const atBottom = box && box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
      stream.textContent = state.chatStream;
      if (box && atBottom) { box.scrollTop = box.scrollHeight; }
    }
    return;
  }
  else if (m.type === 'chatReply') {
    state.chatRunning = undefined; state.chatStream = '';
    if (m.chat.thread.id === state.chatId) { state.chat = m.chat; }
  }
  else if (m.type === 'chatError') {
    if (state.chatPending) { state.chatDraft = state.chatPending; state.chatPending = undefined; }
    state.chatRunning = undefined; state.chatStream = '';
    state.chatError = m.message;
  }
  else if (m.type === 'trail') {
    const atEnd = !state.trail || state.trail.specId !== m.trail.specId || state.replayIndex >= state.trail.entries.length;
    state.trail = m.trail;
    if (atEnd) { state.replayIndex = m.trail.entries.length; }
    if (state.tab === 'workflow') { renderPage(); }
    return;
  }
  else if (m.type === 'profile') {
    state.profile = m.view; state.profileError = undefined; state.pending.clear();
    if (state.suggestionsToQueue && m.view.exists) {
      state.suggestionsToQueue.forEach(s => queueSuggestion(s, false));
      state.suggestionsToQueue = undefined;
    }
  }
  else if (m.type === 'profileError') { state.profileError = m.message; }
  else if (m.type === 'showTab') { state.tab = m.tab; persist(); }
  render();
});

// ---------- layout ----------
function navCount(tab) {
  const s = state.snapshot;
  if (tab === 'profile') {
    const p = s && s.profile;
    if (!p) { return ''; }
    return '<span class="dot ' + (p.state === 'ok' ? 'ok' : p.state === 'missing' ? 'warn' : 'bad') + '"></span>';
  }
  if (tab === 'connections') {
    if (!state.connections) { return ''; }
    const all = state.connections.every(c => c.status === 'connected');
    const none = state.connections.every(c => c.status !== 'connected');
    return '<span class="dot ' + (all ? 'ok' : none ? 'bad' : 'warn') + '"></span>';
  }
  if (tab === 'chat') {
    if (state.chatRunning) { return '<span class="dot warn" title="An agent is answering"></span>'; }
    return state.chats ? '<span class="count">' + state.chats.length + '</span>' : '';
  }
  if (tab === 'workflow') {
    if (!state.workflow) { return ''; }
    const waiting = state.workflow.filter(item => item.phases.some(p => p.state === 'blocked' || (p.nextAction && ['mark-spec-ready', 'approve-architecture', 'review-step'].includes(p.nextAction.id)))).length;
    return waiting ? '<span class="dot warn" title="' + waiting + ' waiting for a person"></span>' : '<span class="count">' + state.workflow.length + '</span>';
  }
  if (!s) { return ''; }
  const counts = { requirements: s.specs.length, plans: s.plans.length, decisions: s.explorations.length + s.architectures.length, sessions: s.sessions.length };
  return tab in counts ? '<span class="count">' + counts[tab] + '</span>' : '';
}

function focusedInput() {
  const active = document.activeElement;
  return active && (active.id === 'search' || active.id === 'chat-input') ? active.id : undefined;
}
function restoreFocus(id) {
  const input = id && document.getElementById(id);
  if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
}

function render() {
  const focused = focusedInput();
  const nav = '<nav class="nav" aria-label="Ordo sections"><div class="brand"><strong>Ordo</strong><span>' + esc(state.snapshot ? state.snapshot.repositoryName : 'No project open') + '</span></div>' +
    NAV.map(group => '<div class="group">' + group.group + '</div>' + group.items.map(item =>
      '<button class="navitem' + (item[0] === state.tab ? ' active' : '') + '" data-tab="' + item[0] + '"' + (item[0] === state.tab ? ' aria-current="page"' : '') + '><span>' + item[1] + '</span>' + navCount(item[0]) + '</button>'
    ).join('')).join('') + '</nav>';
  app.innerHTML = '<div class="layout' + (state.tab === 'chat' ? ' tall' : '') + '">' + nav + '<main class="content"><div class="page" id="page"></div></main></div><div id="bar"></div>';
  renderPage();
  restoreFocus(focused);
}

function renderPage() {
  const focused = focusedInput();
  const page = document.getElementById('page');
  const views = { chat: chatHtml, workflow: workflowHtml, overview: overviewHtml, requirements: requirementsHtml, plans: plansHtml, decisions: decisionsHtml, sessions: sessionsHtml, profile: profileHtml, connections: connectionsHtml };
  const needsProject = state.tab !== 'connections';
  let html = '';
  if (state.error) { html += '<div class="banner error" id="error-banner"></div>'; }
  if (needsProject && !state.snapshot) {
    html += state.error ? '' : '<p class="muted">Loading project information…</p>';
  } else {
    html += views[state.tab]();
  }
  page.innerHTML = html;
  if (state.error) { document.getElementById('error-banner').textContent = state.error; }
  if (state.tab === 'profile') { renderProfileList(); }
  if (state.tab === 'workflow') { renderReplay(); renderPanel(); }
  if (state.tab === 'chat') { finishChat(); }
  page.querySelectorAll('[data-fill]').forEach(el => { el.style.width = Math.min(100, Number(el.dataset.fill) || 0) + '%'; });
  renderBar();
  restoreFocus(focused);
}

// ---------- plan usage ----------
function resetText(iso) {
  if (!iso) { return ''; }
  const date = new Date(iso);
  const ms = date.getTime() - Date.now();
  if (ms <= 0) { return 'resetting now'; }
  const total = Math.round(ms / 60000);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const relative = hours >= 24 ? Math.floor(hours / 24) + 'd ' + (hours % 24) + 'h' : hours > 0 ? hours + 'h ' + minutes + 'm' : minutes + 'm';
  return 'Resets in ' + relative + ' · ' + date.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}
function agoText(iso) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return minutes < 1 ? 'just now' : minutes < 60 ? minutes + ' min ago' : minutes < 1440 ? Math.round(minutes / 60) + ' h ago' : Math.round(minutes / 1440) + ' days ago';
}
function usageHtml(id) {
  if (!state.usage) { return '<p class="muted small">Checking plan usage…</p>'; }
  const u = state.usage.find(item => item.id === id);
  if (!u) { return ''; }
  if (!u.windows.length) { return '<p class="muted small">' + esc(u.note || '') + '</p>'; }
  const meters = u.windows.map(w => {
    const level = w.usedPercent >= 95 ? 'bad' : w.usedPercent >= 80 ? 'warn' : 'ok';
    return '<div class="meter"><div class="meter-head"><span>' + esc(WINDOW_LABELS[w.kind] || w.kind) + '</span><span><strong>' + w.usedPercent + '%</strong> used</span></div>' +
      '<div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + w.usedPercent + '"><div class="fill ' + level + '" data-fill="' + w.usedPercent + '"></div></div>' +
      '<span class="meter-foot">' + esc(resetText(w.resetsAt)) + '</span></div>';
  }).join('');
  const source = u.source === 'live'
    ? 'Live from ' + u.name + (u.plan ? ' · ' + u.plan + ' plan' : '')
    : 'Last seen ' + agoText(u.observedAt) + ' during a ' + u.name + ' run';
  return meters + '<p class="muted small">' + esc(source) + '</p>';
}

function header(title, subtitle, actions) {
  return '<header class="top"><div><h1>' + esc(title) + '</h1>' + (subtitle ? '<p class="muted">' + subtitle + '</p>' : '') + '</div><div class="row">' + (actions || '') + '<button class="secondary" data-action="refresh">Refresh</button></div></header>';
}

function entries(items, empty, render) {
  if (!items.length) { return '<div class="empty">' + empty + '</div>'; }
  return '<div class="list">' + items.map(render).join('') + '</div>';
}

function entry(path, title, sub, pill) {
  return '<button class="entry" data-open="' + esc(path) + '"><span><strong>' + esc(title) + '</strong><span class="sub">' + esc(sub) + '</span></span>' + (pill ? '<span class="pill">' + esc(pill) + '</span>' : '<span></span>') + '</button>';
}

// ---------- project views ----------
function overviewHtml() {
  const s = state.snapshot;
  const c = s.context;
  const decisions = s.explorations.length + s.architectures.length;
  const stat = (tab, count, label) => '<button class="stat" data-tab="' + tab + '"><strong>' + count + '</strong><span>' + label + '</span></button>';
  const p = s.profile;
  const profileText = p.state === 'ok'
    ? plural(p.summary.agents, 'agent') + ' · ' + (p.summary.defaultAgent ? 'default ' + esc(p.summary.defaultAgent) : 'no default agent') + ' · ' + plural(p.summary.skills, 'skill') + ' · ' + plural(p.summary.requiredRules, 'required rule')
    : p.state === 'missing' ? 'Not set up yet. Choose the agents, skills and rules the team uses.' : 'Needs attention: ' + esc(p.message);
  const connections = state.connections
    ? state.connections.map(conn => '<div class="agent"><div class="spread"><strong>' + esc(conn.name) + '</strong><span class="badge ' + esc(conn.status) + '">' + esc(STATUS_LABELS[conn.status]) + '</span></div>' +
      (conn.status === 'connected' ? usageHtml(conn.id) : '<p class="muted small">' + esc(conn.message) + '</p>') + '</div>').join('')
    : '<p class="muted small">Checking installed agents…</p>';
  return header(s.repositoryName, 'Shared requirements, plans and team configuration for this repository.') +
    '<div class="row"><button class="primary" data-action="createRequirement">New business requirement</button><button class="secondary" data-action="createPlan">Create implementation plan</button>' +
    (c.initialized ? '' : '<button class="secondary" data-action="initializeContext">Set up shared context</button>') + '</div>' +
    '<div class="stats">' + stat('requirements', s.specs.length, 'Requirements') + stat('plans', s.plans.length, 'Plans') + stat('decisions', decisions, 'Decisions') + stat('sessions', s.sessions.length, 'Sessions') + '</div>' +
    '<div class="cards">' +
    '<section class="card"><h2>Team profile</h2><p class="muted small">' + profileText + '</p><div class="actions"><button class="secondary" data-tab="profile">' + (p.state === 'ok' ? 'Open team profile' : 'Set up team profile') + '</button></div></section>' +
    '<section class="card"><h2>AI connections &amp; plan usage</h2>' + connections + '<div class="actions"><button class="secondary" data-tab="connections">Manage connections</button></div></section>' +
    '<section class="card"><h2>Project memory</h2><p class="muted small">' + (c.initialized ? 'Visible context: ' + c.summary.visible + ' · Hidden: ' + c.summary.hidden : 'Shared context is not initialized yet.') + '</p><div class="actions">' +
    (c.initialized ? '<button class="secondary" data-open=".ordo/brain.md">Open brain.md</button>' : '<button class="secondary" data-action="initializeContext">Set up shared context</button>') + '</div></section>' +
    '</div>';
}

function requirementsHtml() {
  const s = state.snapshot;
  return header('Requirements', 'Business requirements and specifications shared in <code>.ordo/specs/</code>.', '<button class="primary" data-action="createRequirement">New business requirement</button>') +
    entries(s.specs, 'No shared requirements yet. Create the first one to start planning.', spec => entry('.ordo/specs/' + spec.id + '.md', spec.title, spec.objective || spec.id, spec.status));
}

function plansHtml() {
  const s = state.snapshot;
  return header('Plans', 'Implementation plans linked to a requirement, in <code>.ordo/plans/</code>.', '<button class="primary" data-action="createPlan">Create implementation plan</button>') +
    entries(s.plans, 'No implementation plans yet. Plans start from a shared requirement.', plan => entry('.ordo/plans/' + plan.id + '.json', plan.title, 'Requirement ' + plan.specId + ' · ' + plural(plan.steps.length, 'step'), plan.status));
}

function decisionsHtml() {
  const s = state.snapshot;
  return header('Decisions', 'Business explorations and architecture proposals the team has recorded.') +
    '<h2>Business decisions</h2>' + entries(s.explorations, 'No business explorations yet.', item => entry('.ordo/explore/' + item.id + '.json', item.title, item.problem, item.status)) +
    '<div class="section"><h2>Architecture proposals</h2>' + entries(s.architectures, 'No architecture proposals yet.', item => entry('.ordo/architectures/' + item.id + '.json', item.title, 'Requirement ' + item.specId, item.status)) + '</div>';
}

function sessionsHtml() {
  const s = state.snapshot;
  return header('Sessions', 'Agent sessions recorded for this repository.') +
    entries(s.sessions, 'No sessions yet. Sessions appear here when an agent runs a plan step.', item => entry('.ordo/sessions/' + item.id + '.json', item.title, item.runtime ? item.runtime.provider + ' / ' + item.runtime.model : 'No model selected', item.status));
}

// ---------- workflow and replay ----------
function selectedItem() {
  return state.workflow ? state.workflow.find(item => item.key === state.selectedKey) : undefined;
}
function formatTokens(value) { return Number(value).toLocaleString() + ' tokens'; }
function shortTime(iso) {
  return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function actionButton(item, action) {
  if (!action) { return ''; }
  const target = action.target || {};
  return '<button class="primary" data-wf-action="' + esc(action.id) + '" data-target-kind="' + esc(target.kind || '') + '" data-target-id="' + esc(target.id || '') + '" data-step-id="' + esc(action.stepId || '') + '" data-spec-id="' + esc(item.specId || '') + '">' + esc(action.label) + '</button>';
}

function workflowHtml() {
  let html = header('Workflow', 'Where every requirement stands in the Ordo flow. Select one to replay how it got there: who decided, which agent worked and what it cost.');
  if (state.workflowError) { html += '<div class="banner error">' + esc(state.workflowError) + '</div>'; }
  html += '<div id="panel"></div>';
  if (!state.workflow) { return html + '<p class="muted">Loading the workflow…</p>'; }
  if (!state.workflow.length) { return html + '<div class="empty">No requirements or explorations yet.</div>'; }
  html += '<div class="pipeline"><table><thead><tr><th class="name">Requirement</th>' + PHASES.map(p => '<th>' + p + '</th>').join('') + '</tr></thead><tbody>';
  html += state.workflow.map(item => {
    const selected = item.key === state.selectedKey;
    const tokens = item.tokens ? formatTokens(item.tokens.total) + (item.tokens.unmeasuredSessions ? ' + ' + item.tokens.unmeasuredSessions + ' not measured' : '') : '';
    const cells = item.phases.map(p => '<td title="' + esc(p.phase + ': ' + p.summary + (p.blockedBy ? ' — ' + p.blockedBy : '')) + '"><span class="cell ' + esc(p.state) + '">' + (STATE_MARKS[p.state] || '') + '</span></td>').join('');
    const current = item.phases.find(p => p.phase === item.currentPhase);
    const detail = current
      ? '<strong>' + esc(current.phase) + '</strong>: ' + esc(current.summary) + (current.blockedBy ? ' · ' + esc(current.blockedBy) : '')
      : 'Every available phase is complete.';
    return '<tr class="req' + (selected ? ' selected' : '') + '" data-select="' + esc(item.key) + '"><td class="name"><strong>' + esc(item.title) + '</strong><span>' + esc(tokens || (item.specId ? 'no agent runs yet' : 'exploration')) + '</span></td>' + cells + '</tr>' +
      '<tr class="reqdetail"><td colspan="9"><div class="spread"><span>' + detail + '</span>' + (current ? actionButton(item, current.nextAction) : '') + '</div></td></tr>';
  }).join('');
  html += '</tbody></table></div>';
  html += '<p class="legend">✓ done · ◐ in progress · ✕ blocked · – skipped · · not available yet</p>';
  html += '<div id="replay"></div>';
  return html;
}

function visibleEntries() {
  const entries = state.trail ? state.trail.entries : [];
  return entries.map((entry, index) => ({ entry: entry, index: index }))
    .filter(x => state.replayFilter === 'all' || (state.replayFilter === 'decision' ? x.entry.category === 'decision' : x.entry.category === 'agent'));
}

function renderReplay() {
  const container = document.getElementById('replay');
  if (!container) { return; }
  const item = selectedItem();
  if (!item) { container.innerHTML = '<div class="empty section">Select a requirement to replay its path through the workflow.</div>'; return; }
  if (!item.specId) { container.innerHTML = '<div class="empty section">Replay becomes available once this exploration is turned into a specification.</div>'; return; }
  if (!state.trail || state.trail.specId !== item.specId) { container.innerHTML = '<p class="muted section">Loading the decision trail…</p>'; return; }
  const entries = state.trail.entries;
  const decisions = entries.filter(e => e.category === 'decision').length;
  const runs = entries.filter(e => e.category === 'agent').length;
  const tokens = state.trail.tokens;
  container.innerHTML = '<section class="section"><div class="spread"><h2>Replay · ' + esc(state.trail.title) + '</h2></div>' +
    '<div class="facts"><span><strong>' + entries.length + '</strong> events</span><span>👤 <strong>' + decisions + '</strong> human decisions</span><span>🤖 <strong>' + runs + '</strong> agent runs</span><span><strong>' + esc(formatTokens(tokens.total)) + '</strong>' + (tokens.unmeasuredSessions ? ' + ' + tokens.unmeasuredSessions + ' runs not measured' : '') + '</span></div>' +
    '<div class="flow" id="replay-flow"></div>' +
    '<div class="controls"><button class="iconbtn" data-replay="start" title="Start" aria-label="Start">⏮</button><button class="iconbtn" data-replay="play" id="replay-play" title="Play" aria-label="Play">▶</button><button class="iconbtn" data-replay="end" title="End" aria-label="End">⏭</button>' +
    '<input type="range" id="replay-range" min="0" max="' + entries.length + '" value="' + state.replayIndex + '" aria-label="Replay position"><span class="label" id="replay-label"></span></div>' +
    '<div class="filters"><button data-filter="all"' + (state.replayFilter === 'all' ? ' class="active"' : '') + '>All</button><button data-filter="decision"' + (state.replayFilter === 'decision' ? ' class="active"' : '') + '>👤 Human decisions</button><button data-filter="agent"' + (state.replayFilter === 'agent' ? ' class="active"' : '') + '>🤖 Agent runs</button></div>' +
    '<ol class="timeline" id="replay-timeline"></ol></section>';
  updateReplay();
}

function updateReplay() {
  if (!state.trail) { return; }
  const entries = state.trail.entries;
  const index = Math.max(0, Math.min(state.replayIndex, entries.length));
  const item = selectedItem();
  const shown = entries.slice(0, index);
  const reached = new Set(shown.map(e => e.phase));
  const now = index > 0 ? entries[index - 1] : undefined;
  const flow = document.getElementById('replay-flow');
  if (flow) {
    flow.innerHTML = PHASES.map((phase, i) => {
      const status = item ? item.phases.find(p => p.phase === phase) : undefined;
      const people = shown.filter(e => e.phase === phase && e.category === 'decision').length;
      const spent = shown.filter(e => e.phase === phase && e.tokens).reduce((sum, e) => sum + e.tokens.total, 0);
      const classes = ['node', reached.has(phase) ? 'reached' : '', now && now.phase === phase ? 'now' : '', status && status.state === 'unavailable' ? 'unavailable' : ''].join(' ');
      const facts = (people ? '👤 ' + people : '') + (spent ? (people ? ' · ' : '') + Math.round(spent / 1000) + 'k tok' : '');
      return (i ? '<span class="arrow">→</span>' : '') + '<div class="' + classes + '"><strong>' + esc(phase) + '</strong><span>' + esc(index === entries.length && status ? status.state : (reached.has(phase) ? 'reached' : '')) + '</span><span>' + esc(facts) + '</span></div>';
    }).join('');
  }
  const label = document.getElementById('replay-label');
  if (label) { label.textContent = index + ' / ' + entries.length + (now ? ' · ' + shortTime(now.at) : ''); }
  const range = document.getElementById('replay-range');
  if (range && Number(range.value) !== index) { range.value = String(index); }
  const play = document.getElementById('replay-play');
  if (play) { play.textContent = state.playing ? '⏸' : '▶'; }
  const timeline = document.getElementById('replay-timeline');
  if (!timeline) { return; }
  const rows = visibleEntries();
  if (!rows.length) { timeline.innerHTML = '<li class="tl"><span class="sub">Nothing recorded for this filter.</span></li>'; return; }
  timeline.innerHTML = rows.map(row => {
    const e = row.entry;
    const cls = ['tl', e.category, row.index >= index ? 'future' : '', row.index === index - 1 ? 'now' : ''].join(' ');
    const who = [e.actor, e.source === 'artifact' ? ('from the artifact' + (e.approximate ? ', time approximate' : '')) : ''].filter(Boolean).join(' · ');
    const tokens = e.category === 'agent'
      ? (e.tokens ? '<span class="tokens' + (e.mostExpensive ? ' top' : '') + '">' + esc(formatTokens(e.tokens.total)) + (e.mostExpensive ? ' · most tokens' : '') + '</span>' : '<span class="tokens">tokens not measured</span>')
      : '';
    const files = e.files ? '<span class="sub">kept ' + e.files.accepted.length + ' file(s)' + (e.files.rejected.length ? ' · undone: ' + esc(e.files.rejected.join(', ')) : '') + '</span>' : '';
    const rejected = (e.rejected || []).map(r => '<span class="sub">not chosen: ' + esc(r.title) + (r.tradeoffs.length ? ' (' + esc(r.tradeoffs.join('; ')) + ')' : '') + '</span>').join('');
    return '<li class="' + cls + '" data-icon="' + CATEGORY_ICONS[e.category] + '"><div class="tlbody"><span class="when">' + esc(shortTime(e.at)) + ' · ' + esc(e.phase) + (who ? ' · ' + esc(who) : '') + '</span>' +
      '<span class="what">' + esc(e.title) + tokens + '</span>' + (e.detail ? '<span class="sub">' + esc(e.detail) + '</span>' : '') + files + rejected + '</div></li>';
  }).join('');
}

// ---------- inline review and run panels ----------
function showPanel() {
  if (state.tab !== 'workflow') { stopReplay(); state.tab = 'workflow'; persist(); render(); }
  else { renderPanel(); }
  const panel = document.getElementById('panel');
  if (panel) { panel.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
}

function panelHeader(title) {
  return '<div class="spread"><h2>' + esc(title) + '</h2><button class="close" data-panel="close" aria-label="Close">✕</button></div>';
}

function reviewPanelHtml(p) {
  const d = p.data;
  const undo = d.files.filter(f => !p.kept.has(f.path)).length;
  const files = d.available
    ? (d.files.length
      ? '<div class="files">' + d.files.map(f => {
          const counts = f.additions === undefined ? 'binary' : '+' + f.additions + ' −' + (f.deletions || 0);
          return '<label class="fileRow' + (p.kept.has(f.path) ? '' : ' undo') + '"><input type="checkbox" data-keep="' + esc(f.path) + '"' + (p.kept.has(f.path) ? ' checked' : '') + ' aria-label="Keep ' + esc(f.path) + '">' +
            '<span class="chg ' + esc(f.change) + '" title="' + esc(f.change) + '">' + CHANGE_MARKS[f.change] + '</span><code>' + esc(f.path) + '</code><span class="counts">' + esc(counts) + '</span>' +
            '<button class="secondary small" data-diff="' + esc(f.path) + '">Diff</button></label>';
        }).join('') + '</div><p class="muted small">Checked files are kept. Uncheck a file to undo it: it goes back to its version from before the agent run. "Diff" opens it beside this page.</p>'
      : '<p class="muted">The agent changed no files.</p>')
    : '<div class="banner">No diff for this run: ' + esc(d.reason || 'unknown') + '. You can still record the decision.</div>';
  const choices = '<div class="choices" role="radiogroup" aria-label="Decision">' + DECISIONS.map(c =>
    '<label class="choice"><input type="radio" name="decision" value="' + c[0] + '"' + (p.decision === c[0] ? ' checked' : '') + '><div><strong>' + c[1] + '</strong><br><span>' + c[2] + '</span></div></label>').join('') + '</div>';
  const noteLabel = p.decision === 'approved' ? 'Note (optional)' : (p.decision === 'blocked' ? 'Why is the step blocked? (required)' : 'What has to change? (required)');
  const submit = undo ? 'Undo ' + undo + ' file' + (undo === 1 ? '' : 's') + ' and submit review' : 'Submit review';
  return '<section class="card panel">' + panelHeader('Code review · step "' + d.stepId + '"') + files + choices +
    '<label class="muted small" for="review-note">' + noteLabel + '</label><textarea id="review-note">' + esc(p.note) + '</textarea>' +
    (p.error ? '<div class="banner error">' + esc(p.error) + '</div>' : '') +
    '<div class="actions"><button class="secondary" data-panel="close">Cancel</button><button class="primary" data-panel="submit-review"' + (p.submitting ? ' disabled' : '') + '>' + esc(p.submitting ? 'Submitting…' : submit) + '</button></div></section>';
}

function runPanelHtml(p) {
  const s = p.setup;
  let body = '';
  if (p.phase === 'busy') {
    body = '<p class="muted">Another agent run is in progress. Wait for it to finish or stop it first.</p>';
  } else if (p.phase === 'setup') {
    const harnesses = '<div class="harnesses" role="radiogroup" aria-label="Agent">' + s.harnesses.map(h =>
      '<button class="harness' + (p.harness === h.id ? ' active' : '') + '" data-harness="' + esc(h.id) + '"' + (h.connected ? '' : ' disabled') + ' aria-pressed="' + (p.harness === h.id) + '"><strong>' + esc(h.name) + '</strong><span>' + esc(h.detail) + '</span></button>').join('') + '</div>';
    let preview = '';
    if (!s.harnesses.some(h => h.connected)) {
      preview = '<div class="banner">No agent is connected. Sign in to Claude Code or Codex, then open this panel again.</div>';
    } else if (!p.preview) {
      preview = '<p class="muted small">Estimating what Ordo will send…</p>';
    } else if (p.preview.error) {
      preview = '<div class="banner error">' + esc(p.preview.error) + '</div>';
    } else {
      const e = p.preview.estimate;
      const bar = '<div class="stack">' + e.parts.map((part, i) => '<div class="seg' + i + '" data-fill="' + (e.estimatedTokens ? (part.estimatedTokens * 100 / e.estimatedTokens).toFixed(1) : 0) + '" title="' + esc(part.name) + '"></div>').join('') + '</div>';
      const legend = '<div class="legend">' + e.parts.map((part, i) => '<span><i class="seg' + i + '"></i>' + esc(part.name) + ' ~' + part.estimatedTokens.toLocaleString() + '</span>').join('') + '</div>';
      const sel = p.preview.selection;
      const selection = sel ? '<p class="muted small">Agent: <strong>' + esc(sel.agent || 'none') + '</strong> · Skills: ' + esc(sel.skills.join(', ') || 'none') + ' · Rules: ' + esc(sel.rules.join(', ') || 'none') + '</p>' : '';
      preview = '<p>Ordo will send <strong>~' + e.estimatedTokens.toLocaleString() + ' tokens</strong> before the agent reads any code.</p>' + bar + legend + selection;
    }
    const ready = p.harness && p.preview && !p.preview.error;
    body = '<p class="muted small">Agent</p>' + harnesses + preview +
      '<label class="muted small" for="run-prompt">Additional instruction (optional)</label><textarea id="run-prompt" placeholder="Anything the agent should know for this step">' + esc(p.prompt) + '</textarea>' +
      '<div class="actions"><button class="secondary" data-panel="close">Cancel</button><button class="primary" data-panel="start-run"' + (ready ? '' : ' disabled') + '>Start</button></div>';
  } else if (p.phase === 'starting' || p.phase === 'running') {
    const name = (s.harnesses.find(h => h.id === p.harness) || {}).name || 'The agent';
    const approvals = p.approvals.map(a => '<div class="approval"><strong>' + esc(name) + ' asks: ' + esc(a.summary) + '</strong>' +
      (a.command ? '<code>' + esc(a.command) + '</code>' : '') + (a.cwd ? '<span class="muted small">in ' + esc(a.cwd) + '</span>' : '') + (a.reason ? '<p class="muted small">' + esc(a.reason) + '</p>' : '') +
      '<div class="actions"><button class="secondary small" data-decline="' + esc(a.id) + '">Decline</button><button class="primary small" data-approve="' + esc(a.id) + '">Allow once</button></div></div>').join('');
    body = '<p>' + esc(name) + (p.phase === 'starting' ? ' is starting…' : ' is working on this step. When it finishes, the code review opens here.') + '</p>' + approvals +
      '<pre id="run-output" aria-live="polite"></pre><div class="actions"><button class="secondary" data-panel="stop-run">Stop</button></div>';
  } else if (p.phase === 'done') {
    body = '<p>Finished' + (p.changedFiles === undefined ? '.' : ': ' + p.changedFiles + ' file(s) changed.') + ' Opening the code review…</p>';
  } else if (p.phase === 'failed') {
    body = '<div class="banner error">' + esc(p.message || 'The run failed.') + '</div><div class="actions"><button class="secondary" data-panel="close">Close</button><button class="primary" data-panel="retry-run">Try again</button></div>';
  }
  return '<section class="card panel">' + panelHeader('Run step "' + s.stepId + '"') + body + '</section>';
}

function renderPanel() {
  const container = document.getElementById('panel');
  if (!container) { return; }
  const p = state.panel;
  if (!p) { container.innerHTML = ''; return; }
  if (p.kind === 'notice') {
    container.innerHTML = '<div class="banner">' + esc(p.text) + ' <button class="close" data-panel="close" aria-label="Dismiss">✕</button></div>';
    return;
  }
  container.innerHTML = p.kind === 'review' ? reviewPanelHtml(p) : runPanelHtml(p);
  container.querySelectorAll('[data-fill]').forEach(el => { el.style.width = el.dataset.fill + '%'; });
  const out = document.getElementById('run-output');
  if (out && p.kind === 'run') { out.textContent = p.output; out.scrollTop = out.scrollHeight; }
}

function panelAction(action) {
  const p = state.panel;
  if (action === 'close') { state.panel = undefined; renderPanel(); return; }
  if (!p) { return; }
  if (action === 'submit-review' && p.kind === 'review') {
    if (p.decision !== 'approved' && !p.note.trim()) { p.error = 'Add a note: the agent and your team need to know why.'; renderPanel(); return; }
    p.error = undefined; p.submitting = true; renderPanel();
    send('submitReview', { planId: p.data.planId, stepId: p.data.stepId, specId: p.data.specId, decision: p.decision, note: p.note, rejectFiles: p.data.files.filter(f => !p.kept.has(f.path)).map(f => f.path) });
  } else if (action === 'start-run' && p.kind === 'run') {
    p.phase = 'starting'; p.output = ''; renderPanel();
    send('startRun', { planId: p.setup.planId, stepId: p.setup.stepId, specId: p.setup.specId, harness: p.harness, prompt: p.prompt });
  } else if (action === 'stop-run') {
    send('stopRun');
  } else if (action === 'retry-run' && p.kind === 'run') {
    send('openRun', { planId: p.setup.planId, stepId: p.setup.stepId, specId: p.setup.specId });
  }
}

function stopReplay() {
  if (state.playing) { clearInterval(state.playing); state.playing = undefined; }
}
function playReplay() {
  if (!state.trail) { return; }
  if (state.playing) { stopReplay(); updateReplay(); return; }
  if (state.replayIndex >= state.trail.entries.length) { state.replayIndex = 0; }
  state.playing = setInterval(() => {
    if (!state.trail || state.replayIndex >= state.trail.entries.length) { stopReplay(); updateReplay(); return; }
    state.replayIndex += 1;
    updateReplay();
  }, 700);
  updateReplay();
}

// ---------- chat ----------
function chatTime(iso) {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Agents answer in Markdown. Everything is escaped first; only code, bold, headings and
// lists become markup, so an answer can never inject HTML into the page.
function inlineMd(text) {
  return esc(text).split('\`').map((part, i) => i % 2
    ? '<code>' + part + '</code>'
    : part.split('**').map((bit, j) => j % 2 ? '<strong>' + bit + '</strong>' : bit).join('')
  ).join('');
}
function md(text) {
  const out = [];
  let list, paragraph = [], code;
  const flush = () => {
    if (paragraph.length) { out.push('<p>' + paragraph.map(inlineMd).join('<br>') + '</p>'); paragraph = []; }
    if (list) { out.push('<' + list.tag + '>' + list.items.map(item => '<li>' + inlineMd(item) + '</li>').join('') + '</' + list.tag + '>'); list = undefined; }
  };
  for (const line of String(text).split('\\n')) {
    if (code) {
      if (line.trim().startsWith('\`\`\`')) { out.push('<pre><code>' + esc(code.join('\\n')) + '</code></pre>'); code = undefined; }
      else { code.push(line); }
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith('\`\`\`')) { flush(); code = []; continue; }
    if (!trimmed) { flush(); continue; }
    const heading = trimmed.match(/^(#{1,4})\\s+(.*)$/);
    if (heading) { flush(); out.push('<h' + (heading[1].length + 2) + '>' + inlineMd(heading[2]) + '</h' + (heading[1].length + 2) + '>'); continue; }
    const bullet = trimmed.match(/^[-*]\\s+(.*)$/);
    const numbered = trimmed.match(/^\\d+[.)]\\s+(.*)$/);
    if (bullet || numbered) {
      const tag = bullet ? 'ul' : 'ol';
      if (paragraph.length || (list && list.tag !== tag)) { flush(); }
      if (!list) { list = { tag: tag, items: [] }; }
      list.items.push((bullet || numbered)[1]);
      continue;
    }
    if (list) { flush(); }
    paragraph.push(line);
  }
  if (code) { out.push('<pre><code>' + esc(code.join('\\n')) + '</code></pre>'); }
  flush();
  return out.join('');
}

function chatMessageHtml(m) {
  const who = m.role === 'user' ? 'You' : AGENT_NAMES[m.agent] || 'Agent';
  const tokens = m.inputTokens !== undefined && m.outputTokens !== undefined ? ' · ' + (m.inputTokens + m.outputTokens).toLocaleString() + ' tokens' : '';
  const body = m.role === 'user' ? esc(m.text) : '<div class="md">' + md(m.text) + '</div>';
  return '<div class="msg ' + (m.role === 'user' ? 'mine' : 'reply') + '"><span class="who">' + esc(who) + ' · ' + esc(chatTime(m.at)) + esc(tokens) + '</span>' +
    body + (m.error ? '<span class="err">' + esc(m.error) + '</span>' : '') + '</div>';
}

const CHAT_PROMPTS = ['Where is the payment validated, and what does it check?', 'Explain the plan of the ready requirement, step by step.', 'What would change to support partial refunds?'];

function chatHtml() {
  let html = '<header class="top compact"><div><h1>Chat</h1><p class="muted small">Read-only: the agent can read and search the code but not change it. Chats stay on this machine, never in <code>.ordo/</code> or Git.</p></div></header>';
  if (state.chatError) { html += '<div class="banner error">' + esc(state.chatError) + '</div>'; }
  if (!state.chats) { return html + '<p class="muted">Loading chats…</p>'; }
  const thread = state.chat && state.chat.thread.id === state.chatId ? state.chat.thread : undefined;
  const list = '<nav class="chatlist" aria-label="Chats"><button class="primary" data-chat-new="1">New chat</button>' + state.chats.map(c =>
    '<button class="chatitem' + (c.id === state.chatId ? ' active' : '') + '" data-chat-open="' + esc(c.id) + '"' + (c.id === state.chatId ? ' aria-current="true"' : '') + '><strong>' + esc(c.title) + '</strong><span>' +
    esc(chatTime(c.updatedAt)) + (c.lastAgent ? ' · ' + esc(AGENT_NAMES[c.lastAgent]) : '') + (c.id === state.chatRunning ? ' · answering…' : '') + '</span></button>').join('') + '</nav>';
  const picker = '<div class="chatpicker"><select id="chat-select" aria-label="Chat"><option value="">New chat</option>' + state.chats.map(c =>
    '<option value="' + esc(c.id) + '"' + (c.id === state.chatId ? ' selected' : '') + '>' + esc(c.title) + '</option>').join('') + '</select></div>';
  const agents = '<div class="segmented" role="radiogroup" aria-label="Agent">' + state.chatHarnesses.map(h =>
    '<button data-chat-agent="' + esc(h.id) + '" class="' + (h.id === state.chatAgent ? 'active' : '') + '" role="radio" aria-checked="' + (h.id === state.chatAgent) + '"' +
    (h.connected ? '' : ' disabled') + ' title="' + esc(h.detail) + '">' + esc(h.name) + '</button>').join('') + '</div>';
  const title = '<span class="title">' + esc(thread ? thread.title : 'New chat') + '</span>';
  const remove = !state.chatId ? ''
    : state.confirmDelete === state.chatId
      ? '<span class="confirm">Delete this chat?<button class="secondary small" data-chat-cancel-delete="1">Cancel</button><button class="primary small" data-chat-delete="' + esc(state.chatId) + '">Delete</button></span>'
      : '<button class="iconish" data-chat-confirm-delete="' + esc(state.chatId) + '" title="Delete this chat" aria-label="Delete this chat">Delete</button>';
  let handoff = '';
  const pendingHandoff = state.chat && thread && state.chatAgent ? state.chat.handoff[state.chatAgent] : undefined;
  if (pendingHandoff && pendingHandoff.messages && thread.messages.length) {
    handoff = '<div class="handoff">' + esc(AGENT_NAMES[state.chatAgent]) + ' has not seen ' + plural(pendingHandoff.messages, 'earlier message') +
      ': Ordo hands ' + (pendingHandoff.messages === 1 ? 'it' : 'them') + ' over with your next message (~' + pendingHandoff.estimatedTokens.toLocaleString() + ' tokens).</div>';
  }
  const answering = state.chatRunning && (state.chatRunning === state.chatId || (state.chatRunning === 'new' && !state.chatId));
  let messages = thread ? thread.messages.map(chatMessageHtml).join('') : '';
  if (state.chatId && !thread) { messages = '<p class="muted">Loading the conversation…</p>'; }
  if (state.chatPending) { messages += chatMessageHtml({ role: 'user', text: state.chatPending, at: new Date().toISOString() }); }
  if (answering) {
    messages += '<div class="msg reply"><span class="who">' + esc(AGENT_NAMES[state.chatAgent] || 'The agent') + ' · answering…</span><div class="md" id="chat-stream"></div></div>';
  }
  if (!messages) {
    messages = '<div class="welcome"><h2>Ask about this project</h2><p class="muted">' + esc(AGENT_NAMES[state.chatAgent] || 'The agent') + ' reads the code to answer. Switch agent at any message: the other one gets what it missed.</p>' +
      '<div class="prompts">' + CHAT_PROMPTS.map(p => '<button data-chat-prompt="' + esc(p) + '">' + esc(p) + '</button>').join('') + '</div></div>';
  }
  const noAgent = !state.chatHarnesses.some(h => h.connected);
  const busyElsewhere = state.chatRunning && !answering;
  const hint = noAgent ? 'No agent is connected: sign in to Claude Code or Codex in AI connections.'
    : busyElsewhere ? 'An agent is answering in another chat.'
    : 'Enter to send · Shift+Enter for a new line';
  const button = answering
    ? '<button class="secondary" data-chat-stop="1">Stop</button>'
    : '<button class="primary" data-chat-send="1"' + (noAgent || busyElsewhere ? ' disabled' : '') + '>Send</button>';
  const composer = '<div class="composer"><div class="composerbox"><textarea id="chat-input" rows="1" aria-label="Message" placeholder="Ask ' + esc(AGENT_NAMES[state.chatAgent] || 'the agent') + ' about the code">' + esc(state.chatDraft) + '</textarea>' + button + '</div>' +
    '<div class="hint">' + esc(hint) + '</div></div>';
  return html + '<div class="chatwrap"><div class="chat">' + list + '<section class="conversation"><div class="chathead">' + picker + title + agents + remove + '</div>' + handoff +
    '<div id="chat-messages" aria-live="polite"><div class="thread">' + messages + '</div></div>' + composer + '</section></div></div>';
}

function growInput(input) {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 200) + 'px';
}

function finishChat() {
  const stream = document.getElementById('chat-stream');
  if (stream) { stream.innerHTML = state.chatStream ? md(state.chatStream) : '<span class="typing">…</span>'; }
  const box = document.getElementById('chat-messages');
  if (box) { box.scrollTop = box.scrollHeight; }
  const input = document.getElementById('chat-input');
  if (input) { growInput(input); }
}

function sendChat() {
  const text = state.chatDraft.trim();
  if (!text || state.chatRunning || !state.chatAgent) { return; }
  state.chatPending = text; state.chatDraft = ''; state.chatError = undefined; state.chatStream = '';
  state.chatRunning = state.chatId || 'new';
  send('sendChat', { chatId: state.chatId, harness: state.chatAgent, text: text });
  render();
  restoreFocus('chat-input');
}

function openChat(id) {
  state.chatId = id || undefined; state.chat = undefined; state.chatError = undefined; state.confirmDelete = undefined;
  persist(); renderPage();
  if (id) { send('openChat', { id: id }); } else { restoreFocus('chat-input'); }
}

// ---------- AI connections ----------
function connectionsHtml() {
  const intro = 'Ordo runs the Claude Code and Codex CLIs installed on this machine, using the account they are already signed in to. If an agent is not logged in, it cannot run.';
  if (!state.connections) { return header('AI connections', intro) + '<p class="muted">Checking installed agents…</p>'; }
  return header('AI connections', intro, '<button class="secondary" data-action="checkConnections">Recheck</button>') + '<div class="cards">' + state.connections.map(c => {
    const keyActions = c.apiKeyStorage === 'ordo-keychain'
      ? '<button class="secondary" data-key-for="' + esc(c.id) + '">' + (c.hasStoredApiKey ? 'Replace API key' : 'Use ' + esc(c.apiKeyProvider) + ' API key') + '</button>' + (c.hasStoredApiKey ? '<button class="secondary" data-clear-for="' + esc(c.id) + '">Remove key</button>' : '')
      : '<button class="secondary" data-key-for="' + esc(c.id) + '">Log in with ' + esc(c.apiKeyProvider) + ' API key</button>';
    const keyNote = c.apiKeyStorage === 'ordo-keychain'
      ? (c.hasStoredApiKey ? 'API key in the system keychain, used only when Claude Code is not logged in.' : 'Optional: your Anthropic API key, used only when Claude Code is not logged in.')
      : 'An API key login is stored by Codex; Ordo keeps no copy.';
    return '<section class="card"><div class="spread"><h2>' + esc(c.name) + '</h2><span class="badge ' + esc(c.status) + '">' + esc(STATUS_LABELS[c.status] || c.status) + '</span></div>' +
      '<span class="detail">' + esc(c.status === 'connected' ? c.version + ' · ' + c.auth : c.message) + '</span>' +
      '<span class="detail">' + esc(c.configuredPath ? 'Path: ' + c.configuredPath : 'Executable detected from PATH') + '</span>' +
      '<span class="detail">' + esc(keyNote) + '</span>' +
      (c.status === 'connected' ? '<h2 class="section">Plan usage</h2>' + usageHtml(c.id) : '') +
      '<div class="actions"><button class="secondary" data-path-for="' + esc(c.id) + '">Set executable path</button>' + keyActions + '</div></section>';
  }).join('') + '</div>';
}

// ---------- team profile ----------
function findItem(kind, id) {
  const group = state.profile.kinds.find(k => k.kind === kind);
  return group ? group.items.find(i => i.id === id) : undefined;
}

function profileHtml() {
  const view = state.profile;
  const intro = 'Agents, skills, rules and workflows every teammate and agent session may use. Shared in <code>.ordo/profile.json</code>.';
  let html = header('Team profile', intro, view && view.exists ? '<button class="secondary" data-open=".ordo/profile.json">Open profile.json</button>' : '');
  if (state.profileError) { html += '<div class="banner error"><strong>Not saved.</strong> ' + esc(state.profileError) + '</div>'; }
  if (!view) { return html + '<p class="muted">Loading the catalog…</p>'; }
  html += '<p class="muted small">Catalog: ' + esc(SOURCE_LABELS[view.contentSource] || view.contentSource) + '</p>';
  if (!view.exists) {
    const count = view.suggestions.length;
    html += '<section class="card"><h2>No team profile yet</h2><p class="muted">It starts with all agents available, <code>common-*</code> rules required, the other rules recommended, all workflows available and no skills. You can change everything afterwards.</p>' +
      (count ? suggestionsList(view.suggestions, false) : '') +
      '<div class="actions">' + (count ? '<button class="primary" data-action="createProfileWithSuggestions">Create with ' + plural(count, 'suggestion') + '</button><button class="secondary" data-action="createProfile">Create without suggestions</button>' : '<button class="primary" data-action="createProfile">Create team profile</button>') + '</div></section>';
  } else {
    if (view.errors.length) {
      html += '<div class="banner"><strong>Needs review.</strong> The catalog changed since these entries were recorded. Accept each update after checking it.<ul>' + view.errors.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul></div>';
    }
    html += sessionHtml(view.session);
    if (view.suggestions.length) {
      html += '<section class="card"><div class="spread"><h2>Suggested for this project</h2><button class="secondary" data-action="queueAllSuggestions">Add all</button></div>' +
        '<p class="muted small">Detected from this repository. Nothing changes until you save.</p>' + suggestionsList(view.suggestions, true) + '</section>';
    }
  }
  html += '<nav class="tabs">' + view.kinds.map(group => {
    const included = group.items.filter(i => i.mode && i.mode !== 'disabled').length;
    return '<button class="tab' + (group.kind === state.profileKind ? ' active' : '') + '" data-kind="' + group.kind + '">' + KIND_LABELS[group.kind] + '<span class="count">' + (view.exists ? included + '/' : '') + group.items.length + '</span></button>';
  }).join('') + '</nav>' +
    '<div class="toolbar"><input id="search" type="search" placeholder="Filter by name or description" value="' + esc(state.query) + '"></div>' +
    '<p class="legend">' + LEGENDS[state.profileKind] + '</p><div id="profile-list"></div>';
  return html;
}

function suggestionsList(suggestions, actionable) {
  return '<div>' + suggestions.map(s => {
    const queued = state.pending.has(s.kind + ':' + s.id);
    const action = !actionable ? '<span class="pill">' + MODE_LABELS[s.suggestedMode] + '</span>'
      : queued ? '<span class="pill">Queued</span>'
      : '<button class="secondary" data-suggest="' + esc(s.kind + ':' + s.id) + '">Add as ' + MODE_LABELS[s.suggestedMode] + '</button>';
    return '<div class="suggestion"><span class="kindchip">' + (s.kind === 'skills' ? 'Skill' : 'Rule') + '</span><span><strong>' + esc(s.name) + '</strong><span class="why">' + esc(s.reasons.join(' · ')) + '</span></span>' + action + '</div>';
  }).join('') + '</div>';
}

function queueSuggestion(suggestion, rerender) {
  const item = findItem(suggestion.kind, suggestion.id);
  if (!item) { return; }
  state.pending.set(suggestion.kind + ':' + suggestion.id, { kind: suggestion.kind, id: suggestion.id, mode: suggestion.suggestedMode, from: item.mode });
  if (rerender !== false) { renderPage(); }
}

function sessionHtml(session) {
  if (!session) { return ''; }
  const agent = session.agent
    ? '<span class="chip">' + esc(session.agent) + '</span> ' + (session.agentRequired ? 'required for every session' : 'unless the session chooses another')
    : '<span class="muted">' + esc(session.problem || 'Each session must choose an agent') + '</span>';
  const chips = list => list.length ? list.map(id => '<span class="chip">' + esc(id) + '</span>').join('') : '<span class="muted">none</span>';
  return '<section class="card"><h2>Every session starts with</h2><dl class="session">' +
    '<dt>Agent</dt><dd>' + agent + '</dd>' +
    '<dt>Skills</dt><dd>' + chips(session.skills) + '</dd>' +
    '<dt>Rules</dt><dd>' + chips(session.rules) + '</dd>' +
    '<dt>Workflows</dt><dd>' + session.workflows + ' available</dd></dl></section>';
}

function renderProfileList() {
  const container = document.getElementById('profile-list');
  if (!container || !state.profile) { return; }
  const view = state.profile;
  const kind = state.profileKind;
  const group = view.kinds.find(k => k.kind === kind);
  const q = state.query.trim().toLowerCase();
  const items = group.items.filter(i => !q || i.name.toLowerCase().includes(q) || i.id.includes(q) || (i.description || '').toLowerCase().includes(q));
  if (!items.length) { container.innerHTML = '<div class="empty">Nothing matches this filter.</div>'; return; }
  container.innerHTML = items.map(item => {
    const change = state.pending.get(kind + ':' + item.id);
    const mode = change ? change.mode : item.mode;
    const options = (mode ? '' : '<option value="" selected disabled>Not in profile</option>') +
      MODES.map(m => '<option value="' + m + '"' + (m === mode ? ' selected' : '') + '>' + MODE_LABELS[m] + '</option>').join('');
    const flags = (item.changed ? '<span class="flag changed">changed in catalog</span>' : '') + (item.missing ? '<span class="flag missing">missing from catalog</span>' : '');
    const accept = item.changed && !change ? '<button class="secondary accept" data-accept="' + esc(item.id) + '">Accept catalog update</button>' : '';
    return '<div class="item' + (change ? ' pending' : '') + (!mode || mode === 'disabled' ? ' off' : '') + '">' +
      '<div><button class="name" data-entry="' + esc(item.id) + '"' + (item.missing ? ' disabled' : '') + '>' + esc(item.name) + '</button>' + flags +
      (item.description ? '<div class="desc">' + esc(item.description) + '</div>' : '') + '</div>' +
      '<div><select data-mode-for="' + esc(item.id) + '"' + (view.exists && !item.missing ? '' : ' disabled') + ' aria-label="Mode for ' + esc(item.name) + '">' + options + '</select>' + accept + '</div></div>';
  }).join('');
}

function renderBar() {
  const bar = document.getElementById('bar');
  if (!bar) { return; }
  if (state.tab !== 'profile' || !state.pending.size) { bar.innerHTML = ''; return; }
  const lines = Array.from(state.pending.values()).map(c => {
    const from = c.from ? MODE_LABELS[c.from] : 'not in profile';
    const text = c.from === c.mode ? 'accept catalog update (' + MODE_LABELS[c.mode] + ')' : from + ' → ' + MODE_LABELS[c.mode];
    return '<li>' + KIND_LABELS[c.kind] + ' · <strong>' + esc(c.id) + '</strong>: ' + esc(text) + '</li>';
  }).join('');
  bar.innerHTML = '<div class="bar"><div class="inner"><div><strong>' + plural(state.pending.size, 'unsaved change') + '</strong> <span class="muted small">— written to .ordo/profile.json in this order when you save</span><ul>' + lines + '</ul></div>' +
    '<div class="buttons"><button class="secondary" data-action="discardProfile">Discard</button><button class="primary" data-action="saveProfile">Save profile</button></div></div></div>';
}

function queueChange(kind, id, mode) {
  const item = findItem(kind, id);
  if (!item) { return; }
  const k = kind + ':' + id;
  state.pending.delete(k);
  if (mode !== item.mode || item.changed) {
    state.pending.set(k, { kind: kind, id: id, mode: mode, from: item.mode });
  }
  renderProfileList();
  renderBar();
}

// ---------- events ----------
document.addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target || target.disabled) { return; }
  const d = target.dataset;
  if (d.tab) { stopReplay(); state.tab = d.tab; persist(); render(); window.scrollTo(0, 0); return; }
  if (d.wfAction === 'review-step') { send('openReview', { planId: d.targetId, stepId: d.stepId, specId: d.specId }); return; }
  if (d.wfAction === 'run-step') { send('openRun', { planId: d.targetId, stepId: d.stepId, specId: d.specId }); return; }
  if (d.wfAction) { send('workflowAction', { action: d.wfAction, targetKind: d.targetKind, targetId: d.targetId, stepId: d.stepId, specId: d.specId }); return; }
  if (d.panel) { panelAction(d.panel); return; }
  if (d.chatNew) { openChat(undefined); return; }
  if (d.chatOpen) { openChat(d.chatOpen); return; }
  if (d.chatPrompt) { state.chatDraft = d.chatPrompt; renderPage(); restoreFocus('chat-input'); return; }
  if (d.chatAgent) { state.chatAgent = d.chatAgent; persist(); renderPage(); restoreFocus('chat-input'); return; }
  if (d.chatSend) { sendChat(); return; }
  if (d.chatStop) { send('stopChat'); return; }
  if (d.chatConfirmDelete) { state.confirmDelete = d.chatConfirmDelete; renderPage(); return; }
  if (d.chatCancelDelete) { state.confirmDelete = undefined; renderPage(); return; }
  if (d.chatDelete) { state.confirmDelete = undefined; state.chatId = undefined; state.chat = undefined; persist(); send('deleteChat', { id: d.chatDelete }); renderPage(); return; }
  if (d.diff && state.panel && state.panel.kind === 'review') { event.preventDefault(); send('openDiff', { planId: state.panel.data.planId, stepId: state.panel.data.stepId, path: d.diff }); return; }
  if (d.harness && state.panel && state.panel.kind === 'run') {
    state.panel.harness = d.harness; state.panel.preview = undefined; renderPanel();
    send('prepareRun', { planId: state.panel.setup.planId, stepId: state.panel.setup.stepId, specId: state.panel.setup.specId, harness: d.harness });
    return;
  }
  if (d.approve || d.decline) {
    const id = d.approve || d.decline;
    send('approvalDecision', { id: id, decision: d.approve ? 'accept' : 'decline' });
    if (state.panel && state.panel.kind === 'run') { state.panel.approvals = state.panel.approvals.filter(a => a.id !== id); renderPanel(); }
    return;
  }
  if (d.replay) {
    if (d.replay === 'play') { playReplay(); return; }
    stopReplay();
    state.replayIndex = d.replay === 'start' ? 0 : (state.trail ? state.trail.entries.length : 0);
    updateReplay();
    return;
  }
  if (d.filter) { state.replayFilter = d.filter; renderReplay(); return; }
  if (d.kind) { state.profileKind = d.kind; persist(); renderPage(); return; }
  if (d.open) { send('openFile', { path: d.open }); return; }
  if (d.entry) { send('openCatalogEntry', { kind: state.profileKind, id: d.entry }); return; }
  if (d.accept) { const item = findItem(state.profileKind, d.accept); if (item) { queueChange(state.profileKind, item.id, item.mode); } return; }
  if (d.suggest) {
    const suggestion = state.profile.suggestions.find(s => s.kind + ':' + s.id === d.suggest);
    if (suggestion) { queueSuggestion(suggestion); }
    return;
  }
  if (d.pathFor) { send('setExecutablePath', { id: d.pathFor }); return; }
  if (d.keyFor) { send('setApiKey', { id: d.keyFor }); return; }
  if (d.clearFor) { send('clearApiKey', { id: d.clearFor }); return; }
  const action = d.action;
  if (action === 'checkConnections') { state.connections = undefined; render(); send('checkConnections'); }
  else if (action === 'queueAllSuggestions') { state.profile.suggestions.forEach(s => queueSuggestion(s, false)); renderPage(); }
  else if (action === 'createProfileWithSuggestions') { state.suggestionsToQueue = state.profile.suggestions.slice(); send('createProfile'); }
  else if (action === 'discardProfile') { state.pending.clear(); renderProfileList(); renderBar(); }
  else if (action === 'saveProfile') { send('saveProfile', { changes: Array.from(state.pending.values()).map(c => ({ kind: c.kind, id: c.id, mode: c.mode })) }); }
  else if (action) { send(action); }
});
document.addEventListener('click', event => {
  const row = event.target.closest('tr[data-select]');
  if (!row || event.target.closest('button')) { return; }
  stopReplay();
  state.selectedKey = row.dataset.select;
  state.trail = undefined;
  persist();
  const item = selectedItem();
  renderPage();
  if (item && item.specId) { send('loadTrail', { specId: item.specId }); }
});
document.addEventListener('change', event => {
  const keep = event.target.closest('input[data-keep]');
  if (keep && state.panel && state.panel.kind === 'review') {
    if (keep.checked) { state.panel.kept.add(keep.dataset.keep); } else { state.panel.kept.delete(keep.dataset.keep); }
    renderPanel();
    return;
  }
  if (event.target.name === 'decision' && state.panel && state.panel.kind === 'review') {
    state.panel.decision = event.target.value; state.panel.error = undefined; renderPanel();
    return;
  }
  if (event.target.id === 'chat-select') { openChat(event.target.value); return; }
  const select = event.target.closest('select[data-mode-for]');
  if (select) { queueChange(state.profileKind, select.dataset.modeFor, select.value); }
});
document.addEventListener('input', event => {
  if (event.target.id === 'search') { state.query = event.target.value; renderProfileList(); }
  if (event.target.id === 'review-note' && state.panel && state.panel.kind === 'review') { state.panel.note = event.target.value; }
  if (event.target.id === 'chat-input') { state.chatDraft = event.target.value; growInput(event.target); }
  if (event.target.id === 'run-prompt' && state.panel && state.panel.kind === 'run') { state.panel.prompt = event.target.value; }
  if (event.target.id === 'replay-range') { stopReplay(); state.replayIndex = Number(event.target.value); updateReplay(); }
});
document.addEventListener('keydown', event => {
  if (event.target.id === 'chat-input' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    sendChat();
  }
});
render();
send('ready');
`
