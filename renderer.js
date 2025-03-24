// renderer.js の先頭に記述（カスタムブロット定義）
const BlockEmbed = Quill.import('blots/block/embed');

class PageBreakBlot extends BlockEmbed {
  static create() {
    let node = super.create();
    node.setAttribute('contenteditable', false);
    node.innerHTML = '<hr class="page-break">';
    return node;
  }
}
PageBreakBlot.blotName = 'pageBreak';
PageBreakBlot.tagName = 'div';
PageBreakBlot.className = 'page-break-container';

Quill.register(PageBreakBlot);

// グローバル変数：各スライド（PDFページ）に対応するノートセクションの開始位置を記録
let slideIndices = [];

document.addEventListener('DOMContentLoaded', () => {
  console.log('Renderer process started.');

  // Split.jsで左右ペインの比率を調整可能にする
  Split(['#pdf-section', '#doc-section'], {
    sizes: [50, 50],
    minSize: 200,
    gutterSize: 10,
    cursor: 'col-resize'
  });

  // Quill の初期化：#note-editor に Snow テーマのエディタを作成
  var quill = new Quill('#note-editor', {
    theme: 'snow'
  });

  // A4サイズの目安（高さ：約1123px）
  const A4_HEIGHT = 1123; // 必要に応じて調整

  // エディタの自動ページブレイク挿入処理（変更不要）
  quill.on('text-change', (delta, oldDelta, source) => {
    const editorElem = document.querySelector('.ql-editor');
    const currentHeight = editorElem.scrollHeight;
    const existingPageBreaks = editorElem.querySelectorAll('.page-break-container').length;
    const expectedPages = existingPageBreaks + 1;
    if (currentHeight > expectedPages * A4_HEIGHT) {
      const length = quill.getLength();
      quill.insertEmbed(length - 1, 'pageBreak', true, Quill.sources.USER);
      quill.setSelection(length + 1, Quill.sources.SILENT);
      console.log(`Inserted page break after page ${expectedPages}.`);
    }
  });

  // PDF.js の初期化（CDN経由）
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.14.305/pdf.worker.min.js';

  // グローバル変数：現在の PDF ドキュメントと PDF の縮小率
  let currentPdf = null;
  let currentScale = parseFloat(document.getElementById('pdf-scale-slider').value);

  // PDF 縮小率スライダー
  const scaleSlider = document.getElementById('pdf-scale-slider');
  const scaleValueSpan = document.getElementById('pdf-scale-value');
  scaleSlider.addEventListener('input', (e) => {
    currentScale = parseFloat(e.target.value);
    scaleValueSpan.textContent = currentScale;
    if (currentPdf) {
      renderPdf(currentPdf, currentScale);
    }
  });

  // ドキュメントズーム用スライダー
  const docScaleSlider = document.getElementById('doc-scale-slider');
  const docScaleValueSpan = document.getElementById('doc-scale-value');
  docScaleSlider.addEventListener('input', (e) => {
    let docScale = parseFloat(e.target.value);
    docScaleValueSpan.textContent = docScale;
    const noteEditor = document.getElementById('note-editor');
    noteEditor.style.transform = `scale(${docScale})`;
    noteEditor.style.transformOrigin = 'top left';
  });

  // PDF をレンダリングする関数
  function renderPdf(pdf, scale) {
    const pdfViewer = document.getElementById('pdf-viewer');
    pdfViewer.innerHTML = ''; // 既存コンテンツをクリア
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      pdf.getPage(pageNum).then(page => {
        const viewport = page.getViewport({ scale: scale });
        const canvas = document.createElement('canvas');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        // canvas のクリックイベントを無効にし、親でイベントを処理する
        canvas.style.pointerEvents = 'none';
        const context = canvas.getContext('2d');
        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };
        page.render(renderContext).promise.then(() => {
          console.log(`Page ${pageNum} rendered at scale ${scale}.`);
          const pageContainer = document.createElement('div');
          pageContainer.className = 'page-container';
          pageContainer.style.cursor = 'pointer';
          const pageLabel = document.createElement('h3');
          pageLabel.textContent = `Page ${pageNum}`;
          pageContainer.appendChild(pageLabel);
          pageContainer.appendChild(canvas);
          // PDF ページクリック時：対応するノートセクションへカーソル移動＆改行挿入
          pageContainer.addEventListener('click', () => {
            if (slideIndices.length >= pageNum) {
              // slideIndices に記録されている位置（"Slide X" ヘッダー直後の空行）にカーソルをセット
              let targetIndex = slideIndices[pageNum - 1];
              // 改行を挿入してからカーソルをその次の行に移動
              quill.insertText(targetIndex, "\n", Quill.sources.USER);
              quill.setSelection(targetIndex + 1, 0, Quill.sources.USER);
              let bounds = quill.getBounds(targetIndex + 1);
              document.querySelector('#note-editor .ql-editor').parentElement.scrollTop = bounds.top;
              console.log(`Scrolled note editor to slide ${pageNum}`);
            }
          });
          pdfViewer.appendChild(pageContainer);
        });
      }).catch(err => {
        console.error(`Error getting page ${pageNum}: ${err.message}`);
      });
    }
  }

  // ノートエディタを PDF のスライド数に合わせて初期化する関数
  function initializeNoteEditor(numSlides) {
    quill.setContents([]); // エディタをクリア
    slideIndices = [];     // スライド開始位置配列を初期化
    for (let i = 1; i <= numSlides; i++) {
      // 現在の長さを取得
      let startIndex = quill.getLength();
      // ヘッダー（セクションタイトル）を挿入（末尾に改行付き）
      quill.insertText(startIndex, `Slide ${i}\n`, { bold: true });
      // ここで改行により編集可能な空行ができるので、その位置を記録
      slideIndices.push(quill.getLength());
      // セクションを分割するためのページブレイクを挿入
      quill.insertEmbed(quill.getLength(), 'pageBreak', true, Quill.sources.API);
      // 改行を挿入
      quill.insertText(quill.getLength(), '\n', Quill.sources.API);
    }
    console.log('Note editor initialized with slide indices:', slideIndices);
  }

  // PDF ファイル選択イベントハンドラー
  const pdfInput = document.getElementById('pdf-file-input');
  pdfInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const fileReader = new FileReader();
      fileReader.onload = function() {
        const typedarray = new Uint8Array(this.result);
        pdfjsLib.getDocument(typedarray).promise.then(pdf => {
          console.log(`PDF loaded with ${pdf.numPages} pages.`);
          currentPdf = pdf;
          renderPdf(pdf, currentScale);
          // ノートエディタを PDF のスライド数に合わせて初期化
          initializeNoteEditor(pdf.numPages);
        }).catch(err => {
          console.error('Error loading PDF: ' + err.message);
        });
      };
      fileReader.readAsArrayBuffer(file);
    }
  });

  const { ipcRenderer } = require('electron');

  document.getElementById('save-pdf-button').addEventListener('click', () => {
    console.log('Save Document PDF ボタンがクリックされました。');
    // ノートエディタのみのHTML内容を取得する
    const noteContent = document.getElementById('note-editor').innerHTML;
    ipcRenderer.send('save-doc-pdf', noteContent);
　　});
});