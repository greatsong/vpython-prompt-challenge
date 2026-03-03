import ReactCodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'

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
        fontSize: '0.875rem',
      }}
    >
      <ReactCodeMirror
        value={value}
        onChange={onChange}
        extensions={[python()]}
        theme={oneDark}
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
