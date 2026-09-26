import { existsSync } from 'node:fs'
import path from 'node:path'
import { readSnapshotFile, type StepChanges } from '@pompeitech/ordo-core'
import * as vscode from 'vscode'
import {
  parseSnapshotLocation,
  rejectedFiles,
  reviewFileItems,
  SNAPSHOT_SCHEME
} from './code-review-model.js'

/** Serves read-only file versions from workspace snapshots to the diff editor. */
export class SnapshotContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly repositoryRoot: () => Promise<string>) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const location = parseSnapshotLocation(uri.path, uri.query)
    if (!location) {
      return ''
    }
    const content = await readSnapshotFile(
      await this.repositoryRoot(),
      location.tree,
      location.file
    )
    return content ? content.toString('utf8') : ''
  }
}

function snapshotUri(tree: string, file: string): vscode.Uri {
  return vscode.Uri.from({ scheme: SNAPSHOT_SCHEME, path: `/${file}`, query: `tree=${tree}` })
}

/**
 * Opens the agent's change to one file: the version from before the run on the left,
 * the file as it is now on the right (or the post-run snapshot if it was deleted).
 */
export async function openAgentDiff(
  repositoryRoot: string,
  changes: StepChanges,
  file: string
): Promise<void> {
  if (!changes.before || !changes.after) {
    return
  }
  const current = path.join(repositoryRoot, file)
  const right = existsSync(current) ? vscode.Uri.file(current) : snapshotUri(changes.after, file)
  await vscode.commands.executeCommand(
    'vscode.diff',
    snapshotUri(changes.before, file),
    right,
    `${file} · before ↔ after the agent run`,
    { preview: true, viewColumn: vscode.ViewColumn.Beside }
  )
}

/**
 * Lists the files the agent changed with a check box each (checked = keep) and a
 * button that opens the diff. Resolves with the files to undo, or undefined if the
 * reviewer cancelled.
 */
export function chooseFilesToKeep(
  repositoryRoot: string,
  changes: StepChanges,
  stepId: string
): Promise<{ readonly rejected: readonly string[] } | undefined> {
  return new Promise(resolve => {
    const picker = vscode.window.createQuickPick<vscode.QuickPickItem & { path: string }>()
    const diffButton = { iconPath: new vscode.ThemeIcon('diff'), tooltip: 'Open the diff' }
    const items = reviewFileItems(changes.files).map(item => ({
      label: item.label,
      description: item.description,
      path: item.path,
      buttons: [diffButton]
    }))
    picker.title = `Code review of "${stepId}" · ${items.length} file(s) changed by the agent`
    picker.placeholder =
      'Uncheck the files to undo; use the diff button to inspect a file. Enter to continue.'
    picker.canSelectMany = true
    picker.ignoreFocusOut = true
    picker.items = items
    picker.selectedItems = items
    let settled = false
    const finish = (value: { readonly rejected: readonly string[] } | undefined) => {
      if (!settled) {
        settled = true
        resolve(value)
        picker.dispose()
      }
    }
    picker.onDidTriggerItemButton(event => {
      void openAgentDiff(repositoryRoot, changes, event.item.path)
    })
    picker.onDidAccept(() => {
      finish({
        rejected: rejectedFiles(
          changes.files,
          picker.selectedItems.map(item => item.path)
        )
      })
    })
    picker.onDidHide(() => finish(undefined))
    picker.show()
    if (items[0]) {
      void openAgentDiff(repositoryRoot, changes, items[0].path)
    }
  })
}
