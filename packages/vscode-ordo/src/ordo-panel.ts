import { randomBytes } from 'node:crypto'
import * as vscode from 'vscode'
import type { OrdoTab, WebviewMessage } from './types.js'
import { pageClient, pageStyles } from './webview.js'
import type { OrdoWorkspace } from './workspace.js'

/** The full-page Ordo view: one editor tab with section navigation. */
export class OrdoPanel implements vscode.Disposable {
  private static current?: OrdoPanel

  static show(workspace: OrdoWorkspace, tab?: OrdoTab): void {
    if (OrdoPanel.current) {
      OrdoPanel.current.panel.reveal(vscode.ViewColumn.One)
    } else {
      OrdoPanel.current = new OrdoPanel(workspace)
    }
    if (tab) {
      OrdoPanel.current.showTab(tab)
    }
  }

  private readonly panel: vscode.WebviewPanel
  private readonly subscriptions: vscode.Disposable[] = []

  private constructor(private readonly workspace: OrdoWorkspace) {
    this.panel = vscode.window.createWebviewPanel('ordo.home', 'Ordo', vscode.ViewColumn.One, {
      enableScripts: true,
      localResourceRoots: [],
      retainContextWhenHidden: true
    })
    const nonce = randomBytes(16).toString('hex')
    this.panel.webview.html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
<title>Ordo</title><style nonce="${nonce}">${pageStyles}</style></head>
<body><div id="app"></div><script nonce="${nonce}">${pageClient}</script></body></html>`
    workspace.attach(message => void this.panel.webview.postMessage(message))
    // Plan usage moves while agents run elsewhere; keep the page reasonably fresh.
    const usageTimer = setInterval(() => void workspace.refreshUsage(), 5 * 60 * 1000)
    this.subscriptions.push(
      { dispose: () => clearInterval(usageTimer) },
      this.panel.webview.onDidReceiveMessage(
        (message: WebviewMessage) => void workspace.handleMessage(message)
      ),
      this.panel.onDidDispose(() => this.dispose())
    )
  }

  private showTab(tab: OrdoTab): void {
    void this.panel.webview.postMessage({ type: 'showTab', tab })
  }

  dispose(): void {
    OrdoPanel.current = undefined
    this.workspace.attach(undefined)
    while (this.subscriptions.length > 0) {
      this.subscriptions.pop()?.dispose()
    }
  }
}

/**
 * The Activity Bar entry. Ordo lives in the editor area, so opening this view opens
 * the full-page Ordo tab and, unless `ordo.closeSidebarOnOpen` is off, closes the
 * sidebar to give the page the full width.
 */
export class OrdoLauncherView implements vscode.WebviewViewProvider {
  constructor(private readonly open: () => void) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = { enableScripts: true, localResourceRoots: [] }
    const nonce = randomBytes(16).toString('hex')
    view.webview.html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
<style nonce="${nonce}">body{font-family:var(--vscode-font-family);color:var(--vscode-descriptionForeground);padding:12px;font-size:12px}button{margin-top:8px;width:100%;padding:6px;border:0;border-radius:4px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);cursor:pointer}</style></head>
<body><p>Ordo opens as a full page in the editor.</p><button id="open">Open Ordo</button>
<script nonce="${nonce}">const vscode=acquireVsCodeApi();document.getElementById('open').addEventListener('click',()=>vscode.postMessage('open'))</script></body></html>`
    view.webview.onDidReceiveMessage(() => this.launch())
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        this.launch()
      }
    })
    this.launch()
  }

  private launch(): void {
    this.open()
    if (vscode.workspace.getConfiguration('ordo').get<boolean>('closeSidebarOnOpen', true)) {
      void vscode.commands.executeCommand('workbench.action.closeSidebar')
    }
  }
}
