// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

export function activate(context: vscode.ExtensionContext) {
	const previewCommand = vscode.commands.registerCommand('mermaid.previewDiagram', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('Open a Mermaid file or select an editor before previewing.');
			return;
		}

		MermaidPreviewPanel.render(context.extensionUri, editor.document);
	});

	context.subscriptions.push(previewCommand);
}

export function deactivate() {
	MermaidPreviewPanel.disposeCurrentPanel();
}

type ThemePresetKey = 'classic' | 'dark';

class MermaidPreviewPanel {
	public static currentPanel: MermaidPreviewPanel | undefined;
	private static readonly viewType = 'mermaidPreview';
	private static preferredTheme: ThemePresetKey = 'classic';

	private readonly panel: vscode.WebviewPanel;
	private readonly extensionUri: vscode.Uri;
	private readonly disposables: vscode.Disposable[] = [];
	private documentUri: vscode.Uri;
	private lastDiagram = '';
	private currentLabel = 'diagram';
	private themeKind: ThemePresetKey = 'classic';

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, document: vscode.TextDocument) {
		this.panel = panel;
		this.extensionUri = extensionUri;
		this.documentUri = document.uri;
		this.currentLabel = this.getDiagramLabel(document);
		this.themeKind = MermaidPreviewPanel.preferredTheme;
		this.panel.webview.options = {
			enableScripts: true
		};
		this.panel.title = this.getPanelTitle(this.currentLabel);
		this.panel.webview.html = this.getHtmlForWebview(this.panel.webview);
		this.registerListeners();
		this.postTheme();
		this.postDiagram(document.getText());
	}

	public static render(extensionUri: vscode.Uri, document: vscode.TextDocument) {
		if (MermaidPreviewPanel.currentPanel) {
			MermaidPreviewPanel.currentPanel.reveal(document);
			return;
		}

		const label = path.basename(document.fileName || 'diagram') || 'diagram';
		const panel = vscode.window.createWebviewPanel(
			MermaidPreviewPanel.viewType,
			`Mermaid Preview (${label})`,
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);

		MermaidPreviewPanel.currentPanel = new MermaidPreviewPanel(panel, extensionUri, document);
	}

	public static disposeCurrentPanel() {
		if (MermaidPreviewPanel.currentPanel) {
			MermaidPreviewPanel.currentPanel.dispose();
		}
	}

	private reveal(document: vscode.TextDocument) {
		this.panel.reveal(vscode.ViewColumn.Beside);
		this.updateDocument(document);
	}

	private updateDocument(document: vscode.TextDocument) {
		this.documentUri = document.uri;
		this.currentLabel = this.getDiagramLabel(document);
		this.panel.title = this.getPanelTitle(this.currentLabel);
		this.postDiagram(document.getText());
	}

	private registerListeners() {
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		this.panel.webview.onDidReceiveMessage(async message => {
			switch (message.type) {
				case 'saveSvg':
					await this.saveSvg(message.svg as string | undefined);
					break;
				case 'savePng':
					await this.savePng(message.base64 as string | undefined);
					break;
				case 'requestRefresh':
					await this.refreshFromDocument();
					break;
				case 'themeChange': {
					const requested = message.theme as ThemePresetKey | undefined;
					if (requested && requested !== this.themeKind) {
						this.themeKind = requested;
						MermaidPreviewPanel.preferredTheme = requested;
						this.postTheme();
						if (this.lastDiagram) {
							this.postDiagram(this.lastDiagram);
						}
					}
					break;
				}
				default:
					console.warn('Unsupported message from Mermaid preview', message);
			}
		}, undefined, this.disposables);

		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument(event => {
				if (event.document.uri.toString() === this.documentUri.toString()) {
					this.currentLabel = this.getDiagramLabel(event.document);
					this.panel.title = this.getPanelTitle(this.currentLabel);
					this.postDiagram(event.document.getText());
				}
			})
		);
	}

	private async refreshFromDocument() {
		try {
			const document = await vscode.workspace.openTextDocument(this.documentUri);
			this.currentLabel = this.getDiagramLabel(document);
			this.panel.title = this.getPanelTitle(this.currentLabel);
			this.postDiagram(document.getText());
		} catch (error) {
			vscode.window.showErrorMessage('Unable to refresh Mermaid document.');
			console.error(error);
		}
	}

	private postDiagram(content: string) {
		this.lastDiagram = content;
		this.panel.webview.postMessage({
			type: 'update',
			value: content,
			fileName: this.currentLabel,
			theme: this.themeKind
		});
	}

	private postTheme() {
		this.panel.webview.postMessage({
			type: 'theme',
			kind: this.themeKind
		});
	}

	private async saveSvg(svg: string | undefined) {
		if (!svg) {
			vscode.window.showWarningMessage('No rendered SVG is available yet.');
			return;
		}

		await this.saveBinary('svg', Buffer.from(svg, 'utf8'));
	}

	private async savePng(base64: string | undefined) {
		if (!base64) {
			vscode.window.showWarningMessage('No rendered PNG is available yet.');
			return;
		}

		const buffer = Buffer.from(base64, 'base64');
		await this.saveBinary('png', buffer);
	}

	private async saveBinary(extension: string, data: Uint8Array) {
		const defaultFileName = this.getSuggestedFileName(this.currentLabel, extension);
		const saveUri = await vscode.window.showSaveDialog({
			defaultUri: this.getDefaultUri(defaultFileName),
			filters: {
				[extension.toUpperCase()]: [extension]
			}
		});

		if (!saveUri) {
			return;
		}

		await vscode.workspace.fs.writeFile(saveUri, data);
		vscode.window.showInformationMessage(`Saved Mermaid diagram to ${saveUri.fsPath}`);
	}

	private getDefaultUri(fileName: string) {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (workspaceFolder) {
			return vscode.Uri.joinPath(workspaceFolder.uri, fileName);
		}

		return vscode.Uri.file(path.join(os.homedir(), fileName));
	}

	private getSuggestedFileName(seed: string, extension: string) {
		const sanitized = seed
			.replace(/\s+/g, '-')
			.replace(/[^a-zA-Z0-9\-_.]/g, '')
			|| 'diagram';
		return sanitized.endsWith(`.${extension}`) ? sanitized : `${sanitized}.${extension}`;
	}

	private getDiagramLabel(document: vscode.TextDocument) {
		const filename = path.basename(document.fileName || '').trim();
		return filename || 'Untitled Mermaid';
	}

	private getPanelTitle(label: string) {
		return `Mermaid Preview (${label})`;
	}

	private getHtmlForWebview(webview: vscode.Webview) {
		const nonce = getNonce();
		// Use local Mermaid library for privacy
		const mermaidPath = vscode.Uri.joinPath(this.extensionUri, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
		const mermaidScript = webview.asWebviewUri(mermaidPath);

		return `<!DOCTYPE html>
		<html lang="en">
		<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${webview.cspSource}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource};" />
		<title>Mermaid Preview</title>
			<style nonce="${nonce}">
				body {
					padding: 0 1rem 1rem;
					font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
					background-color: var(--preview-bg, #f8f9fb);
					color: var(--preview-fg, #111111);
					transition: background-color 0.2s ease, color 0.2s ease;
				}
				header {
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 0.5rem;
					padding: 0.75rem 0;
				}
				button {
					background: var(--preview-button-bg, #0078d4);
					border: none;
					color: var(--preview-button-fg, #ffffff);
					padding: 0.35rem 0.8rem;
					border-radius: 4px;
					cursor: pointer;
				}
				button:hover {
					background: var(--preview-button-hover, #005a9e);
				}
				#preview {
					border: 1px solid var(--preview-border, #d7d9e0);
					min-height: calc(100vh - 140px);
					height: calc(100vh - 180px);
					max-height: none;
					width: 100%;
					padding: 1.5rem;
					overflow: auto;
					border-radius: 18px;
					background-color: var(--preview-panel-bg, #ffffff);
					background-image:
						radial-gradient(var(--preview-grid-dot, rgba(76, 86, 128, 0.25)) 1px, transparent 0);
					background-size: 24px 24px;
					position: relative;
				}
				#preview svg {
					max-width: 100%;
					height: auto;
				}
				.placeholder {
					color: var(--preview-muted, #666666);
					text-align: center;
					padding: 2rem 0;
				}
				.status {
					margin-top: 0.5rem;
					color: var(--preview-muted, #666666);
				}
				.theme-toggle {
					display: flex;
					align-items: center;
					gap: 0.35rem;
					font-size: 0.85rem;
					color: var(--preview-muted, #666666);
				}
				.theme-toggle select {
					background: var(--preview-panel-bg, #ffffff);
					color: var(--preview-fg, #111111);
					border: 1px solid var(--preview-border, #d7d9e0);
					border-radius: 6px;
					padding: 0.2rem 0.4rem;
					font-size: 0.85rem;
				}
				/* Hide Mermaid error icons */
				body > svg[id*="mermaid"] {
					display: none !important;
				}
				svg text:has-text("Syntax error"),
				svg text:has-text("Parse error") {
					display: none !important;
				}
			</style>
		</head>
		<body>
			<header>
				<div>
					<strong>Mermaid プレビュー</strong>
					<div id="file-name" style="font-size: 0.85rem; opacity: 0.8;"></div>
				</div>
			<div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
				<label class="theme-toggle">
					テーマ
					<select id="theme-select">
						<option value="classic">クラシック</option>
						<option value="dark">ダーク</option>
					</select>
				</label>
				<button id="refresh">更新</button>
					<button id="save-svg">SVG保存</button>
					<button id="save-png">PNG保存</button>
				</div>
			</header>
		<div id="preview" role="region" aria-live="polite">
			<p class="placeholder">VS Codeで Mermaid 図を編集すると、ここにレンダリング結果が表示されます。</p>
		</div>
			<div id="status" class="status" role="status"></div>
			<script nonce="${nonce}" src="${mermaidScript}"></script>
			<script nonce="${nonce}">
				const vscode = acquireVsCodeApi();
				const persistedState = vscode.getState ? (vscode.getState() ?? {}) : {};
				const themePresets = {
					classic: {
						theme: 'default',
						background: '#f5f7fb',
						panelBackground: '#ffffff',
						foreground: '#111321',
						muted: '#6c7280',
						buttonBackground: '#5d5fef',
						buttonHover: '#4e50d4',
						buttonForeground: '#ffffff',
						border: '#dfe3f6',
						error: '#d63232',
						gridDot: 'rgba(93, 95, 239, 0.22)',
						mermaid: {
							fontFamily: "Inter, 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif"
						}
					},
					dark: {
						theme: 'dark',
						background: '#1e1f25',
						panelBackground: '#242631',
						foreground: '#f5f7fb',
						muted: '#a5acc7',
						buttonBackground: '#2f81f7',
						buttonHover: '#397ffb',
						buttonForeground: '#ffffff',
						border: '#3a3f52',
						error: '#ff7b72',
						gridDot: 'rgba(255, 255, 255, 0.1)',
						mermaid: {
							fontFamily: "Inter, 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
							primaryColor: '#2b2f3a',
							primaryTextColor: '#f5f7fb',
							primaryBorderColor: '#7c84ff',
							lineColor: '#7c84ff',
							secondaryColor: '#242631',
							clusterBkg: '#1e1f25',
							clusterBorder: '#3a3f52'
						}
					}
				};
				let currentSvg = '';
				let currentSource = '';
				let currentThemeKind = persistedState.themeKind ?? 'classic';
				const status = document.getElementById('status');
				const preview = document.getElementById('preview');
				const fileNameLabel = document.getElementById('file-name');
				const themeSelect = document.getElementById('theme-select');

				const setStatus = (message, isError = false) => {
					status.textContent = message ?? '';
					status.style.color = isError ? 'var(--preview-error, #be1100)' : 'var(--preview-muted, #6f6f6f)';
				};

				const renderDiagram = async (source, skipPersist = false) => {
					if (!skipPersist) {
						currentSource = source;
				}
				if (!source.trim()) {
					preview.innerHTML = '<p class="placeholder">エディタに Mermaid 構文を追加してプレビューを更新してください。</p>';
					currentSvg = '';
					setStatus('');
					return;
				}

				try {
					// Completely clear the preview container before rendering
					preview.innerHTML = '';
					
					const { svg } = await mermaid.render('mermaid-preview-' + Date.now(), source);
					
					// Only set content after successful render
					preview.innerHTML = svg;
					currentSvg = svg;
					setStatus('レンダリング成功');
					// Clear status after 2 seconds
					setTimeout(() => setStatus(''), 2000);
				} catch (error) {
					// Clear everything and show simple error message without icons
					preview.innerHTML = '<p class="placeholder">Mermaid がこの図をレンダリングできませんでした。構文を確認して再試行してください。</p>';
					currentSvg = '';
					
					// Remove any error SVG elements that Mermaid may have inserted into body
					setTimeout(() => {
						const errorSvgs = document.querySelectorAll('body > svg[id*="mermaid"]');
						errorSvgs.forEach(svg => svg.remove());
					}, 100);
					
					setStatus(error?.message ?? '不明な Mermaid レンダリングエラー。', true);
				}
			};				const persistTheme = (kind) => {
					persistedState.themeKind = kind;
					vscode.setState?.(persistedState);
					vscode.postMessage({ type: 'themeChange', theme: kind });
				};

				const applyTheme = (kind) => {
					const preset = themePresets[kind] ?? themePresets.classic;
					currentThemeKind = kind;
					if (themeSelect && themeSelect.value !== kind) {
						themeSelect.value = kind;
					}
					mermaid.initialize({
						startOnLoad: false,
						theme: preset.theme,
						themeVariables: {
							...preset.mermaid
						}
					});
					document.body.style.setProperty('--preview-bg', preset.background);
					document.body.style.setProperty('--preview-fg', preset.foreground);
					document.body.style.setProperty('--preview-panel-bg', preset.panelBackground);
					document.body.style.setProperty('--preview-muted', preset.muted);
					document.body.style.setProperty('--preview-button-bg', preset.buttonBackground);
					document.body.style.setProperty('--preview-button-hover', preset.buttonHover);
					document.body.style.setProperty('--preview-button-fg', preset.buttonForeground);
					document.body.style.setProperty('--preview-border', preset.border);
					document.body.style.setProperty('--preview-error', preset.error);
					document.body.style.setProperty('--preview-grid-dot', preset.gridDot);
					if (currentSource) {
						void renderDiagram(currentSource, true);
					}
				};

				applyTheme(currentThemeKind);
				if (themeSelect) {
					themeSelect.value = currentThemeKind;
					themeSelect.addEventListener('change', () => {
						const selected = themeSelect.value;
						applyTheme(selected);
						persistTheme(selected);
					});
				}

				window.addEventListener('message', event => {
					const message = event.data;
					if (message?.type === 'update') {
						if (message.theme) {
							applyTheme(message.theme);
						}
						fileNameLabel.textContent = message.fileName ?? 'Untitled Mermaid';
						void renderDiagram(message.value ?? '');
					} else if (message?.type === 'status') {
						setStatus(message.message ?? '', message.severity === 'error');
					} else if (message?.type === 'theme') {
						applyTheme(message.kind ?? currentThemeKind);
					}
				});

				document.getElementById('refresh').addEventListener('click', () => {
					vscode.postMessage({ type: 'requestRefresh' });
				});

			document.getElementById('save-svg').addEventListener('click', () => {
				if (!currentSvg) {
					setStatus('保存する内容がありません — 最初に図をレンダリングしてください。', true);
					return;
				}
				vscode.postMessage({ type: 'saveSvg', svg: currentSvg });
			});			document.getElementById('save-png').addEventListener('click', () => {
				if (!currentSvg) {
					setStatus('保存する内容がありません — 最初に図をレンダリングしてください。', true);
					return;
				}

				// Get the actual SVG element from the DOM to capture full dimensions
				const svgElement = preview.querySelector('svg');
				if (!svgElement) {
					setStatus('エクスポートする SVG が見つかりません。', true);
					return;
				}					// Get the bounding box to ensure we capture the full diagram
					const bbox = svgElement.getBBox();
					const viewBox = svgElement.getAttribute('viewBox');
					let width = bbox.width;
					let height = bbox.height;

					// If viewBox is set, use those dimensions
					if (viewBox) {
						const [, , vbWidth, vbHeight] = viewBox.split(' ').map(Number);
						if (vbWidth && vbHeight) {
							width = vbWidth;
							height = vbHeight;
						}
					}

					// Use the larger of computed width/height or viewBox dimensions
					const computedWidth = svgElement.getBoundingClientRect().width;
					const computedHeight = svgElement.getBoundingClientRect().height;
					width = Math.max(width, computedWidth);
					height = Math.max(height, computedHeight);

					const svgUrl = 'data:image/svg+xml;base64,' + window.btoa(unescape(encodeURIComponent(currentSvg)));
					const image = new Image();
					image.onload = () => {
						const canvas = document.createElement('canvas');
						const scale = window.devicePixelRatio || 2; // Use at least 2x for better quality
						canvas.width = width * scale;
						canvas.height = height * scale;
					const ctx = canvas.getContext('2d');
					if (!ctx) {
						setStatus('PNG 出力を準備できません。', true);
						return;
					}
					ctx.scale(scale, scale);
					ctx.fillStyle = 'white'; // Fill with white background
					ctx.fillRect(0, 0, width, height);
					ctx.drawImage(image, 0, 0, width, height);
					const pngData = canvas.toDataURL('image/png').split(',')[1];
					vscode.postMessage({ type: 'savePng', base64: pngData });
				};
				image.onerror = () => setStatus('PNG 出力を準備できません。', true);
					image.src = svgUrl;
				});
			</script>
		</body>
		</html>`;
	}

	public dispose() {
		MermaidPreviewPanel.currentPanel = undefined;
		this.panel.dispose();
		while (this.disposables.length) {
			const disposable = this.disposables.pop();
			disposable?.dispose();
		}
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i += 1) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
