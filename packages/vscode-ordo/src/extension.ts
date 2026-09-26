import path from 'node:path'
import type { AgentAdapterId } from '@pompeitech/ordo-runtime'
import * as vscode from 'vscode'
import { SnapshotContentProvider } from './code-review.js'
import { SNAPSHOT_SCHEME } from './code-review-model.js'
import { CLAUDE_API_KEY_SECRET, LEGACY_OPENAI_API_KEY_SECRET } from './connections.js'
import { OrdoLauncherView, OrdoPanel } from './ordo-panel.js'
import type { OrdoTab } from './types.js'
import { getWorkspaceRoot, OrdoWorkspace } from './workspace.js'

const LAUNCHER_VIEW_ID = 'ordo.workspace'

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Ordo', { log: true })
  const workspace = new OrdoWorkspace(log, context.secrets, context.asAbsolutePath('content'))
  const open = (tab?: OrdoTab) => OrdoPanel.show(workspace, tab)
  const refreshProject = () => {
    void workspace.refresh()
    void workspace.refreshProfile()
    void workspace.refreshWorkflow()
  }
  // Workflow changes also come from the terminal (`ordo agent`, `ordo plan review`).
  let workflowTimer: NodeJS.Timeout | undefined
  const refreshWorkflowSoon = () => {
    clearTimeout(workflowTimer)
    workflowTimer = setTimeout(() => {
      void workspace.refresh()
      void workspace.refreshWorkflow()
    }, 300)
  }
  const artifactWatcher = vscode.workspace.createFileSystemWatcher(
    '**/.ordo/{specs,plans,explore,architectures,audit,sessions}/**'
  )
  const profileWatcher = vscode.workspace.createFileSystemWatcher('**/.ordo/profile.json')

  context.subscriptions.push(
    log,
    vscode.workspace.registerTextDocumentContentProvider(
      SNAPSHOT_SCHEME,
      new SnapshotContentProvider(getWorkspaceRoot)
    ),
    vscode.window.registerWebviewViewProvider(LAUNCHER_VIEW_ID, new OrdoLauncherView(() => open())),
    vscode.commands.registerCommand('ordo.openWorkspace', () => open('overview')),
    vscode.commands.registerCommand('ordo.openWorkflow', () => open('workflow')),
    artifactWatcher,
    artifactWatcher.onDidCreate(refreshWorkflowSoon),
    artifactWatcher.onDidChange(refreshWorkflowSoon),
    artifactWatcher.onDidDelete(refreshWorkflowSoon),
    { dispose: () => clearTimeout(workflowTimer) },
    vscode.commands.registerCommand('ordo.openTeamProfile', () => open('profile')),
    vscode.commands.registerCommand('ordo.openConnections', () => open('connections')),
    vscode.commands.registerCommand('ordo.refresh', refreshProject),
    vscode.commands.registerCommand('ordo.createRequirement', () => workspace.createRequirement()),
    vscode.commands.registerCommand('ordo.createPlan', () => workspace.createImplementationPlan()),
    vscode.commands.registerCommand('ordo.initializeContext', () => workspace.initializeContext()),
    vscode.commands.registerCommand('ordo.checkConnections', () => workspace.refreshConnections()),
    vscode.commands.registerCommand('ordo.setExecutablePath', (id?: AgentAdapterId) =>
      workspace.setExecutablePath(id)
    ),
    vscode.commands.registerCommand('ordo.setApiKey', (id?: AgentAdapterId) =>
      workspace.setApiKey(id)
    ),
    vscode.commands.registerCommand('ordo.clearApiKey', () => workspace.clearApiKey('claude-code')),
    profileWatcher,
    profileWatcher.onDidCreate(refreshProject),
    profileWatcher.onDidChange(refreshProject),
    profileWatcher.onDidDelete(refreshProject),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('ordo')) {
        void workspace.refreshConnections()
      }
    }),
    context.secrets.onDidChange(event => {
      if (event.key === CLAUDE_API_KEY_SECRET) {
        void workspace.refreshConnections()
      }
    }),
    vscode.workspace.onDidSaveTextDocument(document => {
      if (document.uri.fsPath.includes(`${path.sep}.ordo${path.sep}`)) {
        void workspace.refresh()
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(refreshProject)
  )
  // Keeps the packaged smoke's "snapshot loaded" signal independent of the page being open.
  void workspace.refresh()
  // Ordo no longer keeps OpenAI keys (Codex stores its own); drop any prototype leftover.
  void context.secrets.delete(LEGACY_OPENAI_API_KEY_SECRET)
}

export function deactivate(): void {}
