import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary from '../src/components/ErrorBoundary.jsx'

function Boom({ shouldThrow = true }) {
  if (shouldThrow) throw new Error('테스트 폭발')
  return <div>정상</div>
}

describe('ErrorBoundary', () => {
  let errorSpy
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('자식이 정상이면 그대로 렌더링한다', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('정상')).toBeInTheDocument()
  })

  it('자식이 throw하면 fallback UI를 보여준다', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('문제가 발생했습니다')).toBeInTheDocument()
    expect(screen.getByText(/테스트 폭발/)).toBeInTheDocument()
  })

  it('"다시 시도" 버튼이 렌더링되며 클릭 가능하다', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    const retry = screen.getByRole('button', { name: '다시 시도' })
    expect(retry).toBeInTheDocument()
    fireEvent.click(retry)
  })
})
