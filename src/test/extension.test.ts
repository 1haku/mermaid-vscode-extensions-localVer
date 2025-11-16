import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Mermaid extension', () => {
	test('preview command executes without throwing', async () => {
		await assert.doesNotReject(async () => {
			await vscode.commands.executeCommand('mermaid.previewDiagram');
		});
	});
});
