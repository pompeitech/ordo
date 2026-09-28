import { existsSync } from 'node:fs'
import path from 'node:path'
import { readSnapshotFile, type StepChanges } from '@pompeitech/ordo-core'
import * as vscode from 'vscode'
import { parseSnapshotLocation, SNAPSHOT_SCHEME } from './code-review-model.js'

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
