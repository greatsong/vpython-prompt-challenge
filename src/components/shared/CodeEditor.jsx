import ReactCodeMirror, { EditorView } from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'

// 라이트 테마: 흰 바탕 + 크림색 줄 번호 영역 + 노란 선택·커서 강조
const lightTheme = EditorView.theme({
  '&': { backgroundColor: '#fff', color: '#3A2E1A' },
  '.cm-content': { caretColor: '#E8930C' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#E8930C' },
  '.cm-gutters': { backgroundColor: '#FFFCF3', color: '#A8987A', borderRight: '1px solid #F0E2BC' },
  '.cm-activeLine': { backgroundColor: '#FFF9EA' },
  '.cm-activeLineGutter': { backgroundColor: '#FFF3D6', color: '#8A5A00' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: '#FDE7B0 !important' },
  '.cm-matchingBracket': { backgroundColor: '#FDD98A', outline: 'none' },
  '.cm-placeholder': { color: '#B3A37F' },
}, { dark: false })

/**
 * CodeEditor — CodeMirror 6 래퍼
 *
 * Props:
 *   value       string    — 코드 내용
 *   onChange    fn        — 변경 콜백 (value) => void
 *   readOnly    bool      — 읽기 전용 (기본 false)
 *   height      string    — 기본 '200px'
 *   onRun       fn        — Ctrl+Enter 실행 콜백
 *   placeholder string    — 빈 상태 안내 텍스트
 */
export default function CodeEditor({
  value,
  onChange,
  readOnly = false,
  height = '200px',
  onRun,
  placeholder = '# VPython 코드를 입력하세요',
}) {
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      onRun?.()
    }
  }

  return (
    <div
      onKeyDown={handleKeyDown}
      style={{
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: '#fff',
        fontSize: '0.875rem',
      }}
    >
      <ReactCodeMirror
        value={value}
        onChange={onChange}
        extensions={[python(), lightTheme]}
        theme="light"
        readOnly={readOnly}
        placeholder={placeholder}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: !readOnly,
          foldGutter: false,
          dropCursor: false,
          allowMultipleSelections: false,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          tabSize: 4,
        }}
        style={{ height, overflow: 'auto' }}
      />
    </div>
  )
}
