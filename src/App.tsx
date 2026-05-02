import { useState, useEffect, useCallback, useMemo } from 'react'
import quizData from '../assets/cpacc-quiz.json'
import './App.css'

interface Question {
  id: number
  domain: string
  topic: string
  subtopic: string
  question: string
  options: Record<string, string>
  correctAnswer: string
  explanation: string
}

interface QuizState {
  currentIndex: number
  answers: Record<number, string>
  startTime: number
  completed: boolean
  selectedQuestionIds: number[]
}

type AppView = 'start' | 'quiz' | 'results'

const STORAGE_KEY = 'cpacc-quiz-progress'
const HISTORY_KEY = 'cpacc-quiz-history'
const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY

const DOMAIN_CONFIG: Record<string, { name: string; count: number }> = {
  'Domain 1': { name: 'Disabilities, Challenges, and AT', count: 40 },
  'Domain 2': { name: 'Accessibility and Universal Design', count: 40 },
  'Domain 3': { name: 'Standards, Laws, and Management', count: 20 },
}

function shuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function loadHistory(): Record<string, number[]> {
  try {
    const saved = localStorage.getItem(HISTORY_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch {
    // ignore parse errors
  }
  return {}
}

function saveHistory(history: Record<string, number[]>) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
}

function selectQuestionsForQuiz(allQuestions: Question[]): number[] {
  const history = loadHistory()
  const selectedIds: number[] = []

  for (const [domain, config] of Object.entries(DOMAIN_CONFIG)) {
    const domainQuestions = allQuestions.filter((q) => q.domain === domain)
    const recentlyUsed = new Set(history[domain] || [])

    const available = domainQuestions.filter((q) => !recentlyUsed.has(q.id))
    const used = domainQuestions.filter((q) => recentlyUsed.has(q.id))

    let pool: Question[]
    if (available.length >= config.count) {
      pool = shuffle(available).slice(0, config.count)
    } else {
      pool = shuffle(available)
      const needed = config.count - pool.length
      pool = pool.concat(shuffle(used).slice(0, needed))
    }

    selectedIds.push(...pool.map((q) => q.id))

    history[domain] = pool.map((q) => q.id)
  }

  saveHistory(history)
  return shuffle(selectedIds)
}

function loadState(): QuizState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch {
    // ignore parse errors
  }
  return null
}

function saveState(state: QuizState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY)
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

function App() {
  const allQuestions = quizData.questions as Question[]
  const savedState = loadState()

  const [view, setView] = useState<AppView>(() => {
    const hasValidState = savedState && savedState.selectedQuestionIds?.length > 0
    if (hasValidState) {
      return savedState.completed ? 'results' : 'quiz'
    }
    return 'start'
  })

  const [state, setState] = useState<QuizState>(() => {
    if (savedState) {
      return {
        ...savedState,
        selectedQuestionIds: savedState.selectedQuestionIds || [],
      }
    }
    return {
      currentIndex: 0,
      answers: {},
      startTime: Date.now(),
      completed: false,
      selectedQuestionIds: [],
    }
  })
  const [elapsedTime, setElapsedTime] = useState(0)
  const [resultGif, setResultGif] = useState<string | null>(null)

  const questions = useMemo(() => {
    const questionMap = new Map(allQuestions.map((q) => [q.id, q]))
    return state.selectedQuestionIds
      .map((id) => questionMap.get(id))
      .filter((q): q is Question => q !== undefined)
  }, [allQuestions, state.selectedQuestionIds])

  const domainCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const q of questions) {
      counts[q.domain] = (counts[q.domain] || 0) + 1
    }
    return counts
  }, [questions])

  useEffect(() => {
    if (view !== 'start') {
      saveState(state)
    }
  }, [state, view])

  useEffect(() => {
    if (view !== 'quiz' || state.completed) return

    const interval = setInterval(() => {
      setElapsedTime(Date.now() - state.startTime)
    }, 1000)

    return () => clearInterval(interval)
  }, [state.startTime, state.completed, view])

  useEffect(() => {
    if (view !== 'results' || !GIPHY_API_KEY) return

    const correctCount = questions.reduce((count, q) => {
      return state.answers[q.id] === q.correctAnswer ? count + 1 : count
    }, 0)
    const percentage = questions.length > 0 ? (correctCount / questions.length) * 100 : 0
    const isPassing = percentage >= 70

    const searchQuery = isPassing
      ? 'star wars celebration victory'
      : 'star wars yoda wisdom encouragement'

    const fetchGif = async () => {
      try {
        const response = await fetch(
          `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(searchQuery)}&limit=25&rating=g`
        )
        const data = await response.json()
        if (data.data && data.data.length > 0) {
          const randomIndex = Math.floor(Math.random() * data.data.length)
          setResultGif(data.data[randomIndex].images.fixed_height.url)
        }
      } catch (error) {
        console.error('Failed to fetch GIF:', error)
      }
    }

    fetchGif()
  }, [view, questions, state.answers])

  const startQuiz = useCallback(() => {
    const selectedIds = selectQuestionsForQuiz(allQuestions)
    const newState: QuizState = {
      currentIndex: 0,
      answers: {},
      startTime: Date.now(),
      completed: false,
      selectedQuestionIds: selectedIds,
    }
    setState(newState)
    setElapsedTime(0)
    setView('quiz')
  }, [allQuestions])

  const continueQuiz = useCallback(() => {
    setElapsedTime(Date.now() - state.startTime)
    setView(state.completed ? 'results' : 'quiz')
  }, [state.startTime, state.completed])

  const handleAnswer = useCallback((questionId: number, answer: string) => {
    setState((prev) => ({
      ...prev,
      answers: { ...prev.answers, [questionId]: answer },
    }))
  }, [])

  const goToNext = useCallback(() => {
    setState((prev) => {
      const nextIndex = prev.currentIndex + 1
      if (nextIndex >= prev.selectedQuestionIds.length) {
        setView('results')
        return { ...prev, completed: true }
      }
      return { ...prev, currentIndex: nextIndex }
    })
  }, [])

  const goToPrev = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentIndex: Math.max(0, prev.currentIndex - 1),
    }))
  }, [])

  const resetQuiz = useCallback(() => {
    clearState()
    setView('start')
  }, [])

  if (view === 'start') {
    const hasProgress = savedState && savedState.selectedQuestionIds.length > 0
    return (
      <div className="quiz-container">
        <div className="start-screen">
          <h1>{quizData.title}</h1>
          <p className="start-description">{quizData.description}</p>

          <div className="quiz-info">
            <div className="info-card">
              <span className="info-value">100</span>
              <span className="info-label">Questions</span>
            </div>
            <div className="info-card">
              <span className="info-value">~2h</span>
              <span className="info-label">Duration</span>
            </div>
            <div className="info-card">
              <span className="info-value">70%</span>
              <span className="info-label">Pass Score</span>
            </div>
          </div>

          <div className="domain-breakdown">
            <h3>Domain Distribution</h3>
            {Object.entries(DOMAIN_CONFIG).map(([domain, config]) => (
              <div key={domain} className="domain-row">
                <span className="domain-name">
                  {domain}: {config.name}
                </span>
                <span className="domain-score">{config.count} questions</span>
              </div>
            ))}
          </div>

          <p className="start-note">
            Questions are randomly selected from each domain. The quiz tracks your
            history to provide different questions in subsequent attempts.
          </p>

          <div className="start-actions">
            <button className="start-btn primary" onClick={startQuiz}>
              Start New Quiz
            </button>
            {hasProgress && (
              <button className="start-btn secondary" onClick={continueQuiz}>
                Continue Previous Quiz
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (view === 'results') {
    const correctCount = questions.reduce((count, q) => {
      return state.answers[q.id] === q.correctAnswer ? count + 1 : count
    }, 0)

    const domainStats: Record<string, { correct: number; total: number }> = {}
    questions.forEach((q) => {
      if (!domainStats[q.domain]) {
        domainStats[q.domain] = { correct: 0, total: 0 }
      }
      domainStats[q.domain].total++
      if (state.answers[q.id] === q.correctAnswer) {
        domainStats[q.domain].correct++
      }
    })

    const percentage = Math.round((correctCount / questions.length) * 100)

    return (
      <div className="quiz-container">
        <h1>{quizData.title}</h1>
        <div className="results">
          <h2>Quiz Complete!</h2>
          <div className="score">
            <span className="score-number">{correctCount}</span>
            <span className="score-divider">/</span>
            <span className="score-total">{questions.length}</span>
          </div>
          <p className="percentage">{percentage}%</p>
          <p className="time-taken">Time: {formatTime(elapsedTime)}</p>

          {resultGif && (
            <div className="result-gif">
              <img
                src={resultGif}
                alt={percentage >= 70 ? 'Celebration' : 'Encouragement'}
              />
              <p className="gif-message">
                {percentage >= 70
                  ? 'The Force is strong with you!'
                  : 'Do or do not. There is no try. Keep learning!'}
              </p>
            </div>
          )}

          <div className="domain-stats">
            <h3>Results by Domain</h3>
            {Object.entries(domainStats).map(([domain, stats]) => (
              <div key={domain} className="domain-row">
                <span className="domain-name">{domain}</span>
                <span className="domain-score">
                  {stats.correct}/{stats.total} (
                  {Math.round((stats.correct / stats.total) * 100)}%)
                </span>
              </div>
            ))}
          </div>

          <div className="review-section">
            <h3>Review Answers</h3>
            {questions.map((q, idx) => {
              const userAnswer = state.answers[q.id]
              const isCorrect = userAnswer === q.correctAnswer
              return (
                <div
                  key={q.id}
                  className={`review-item ${isCorrect ? 'correct' : 'incorrect'}`}
                >
                  <div className="review-header">
                    <span className="review-number">Q{idx + 1}</span>
                    <span className={`review-status ${isCorrect ? 'correct' : 'incorrect'}`}>
                      {isCorrect ? '✓' : '✗'}
                    </span>
                  </div>
                  <p className="review-question">{q.question}</p>
                  <div className="review-answers">
                    <p>
                      <strong>Your answer:</strong>{' '}
                      {userAnswer
                        ? `${userAnswer}. ${q.options[userAnswer]}`
                        : 'Not answered'}
                    </p>
                    {!isCorrect && (
                      <p className="correct-answer">
                        <strong>Correct answer:</strong> {q.correctAnswer}.{' '}
                        {q.options[q.correctAnswer]}
                      </p>
                    )}
                  </div>
                  {!isCorrect && (
                    <p className="explanation">
                      <strong>Explanation:</strong> {q.explanation}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <button className="restart-btn" onClick={resetQuiz}>
            Start New Quiz
          </button>
        </div>
      </div>
    )
  }

  const currentQuestion = questions[state.currentIndex]
  if (!currentQuestion) {
    return (
      <div className="quiz-container">
        <p>Loading...</p>
      </div>
    )
  }

  const selectedAnswer = state.answers[currentQuestion.id]
  const answeredCount = Object.keys(state.answers).length

  return (
    <div className="quiz-container">
      <header className="quiz-header">
        <h1>{quizData.title}</h1>
        <div className="quiz-meta">
          <span className="timer">{formatTime(elapsedTime)}</span>
          <span className="progress">
            {answeredCount}/{questions.length} answered
          </span>
        </div>
      </header>

      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${(answeredCount / questions.length) * 100}%` }}
        />
      </div>

      <main className="question-card">
        <div className="question-info">
          <span className="question-number">
            Question {state.currentIndex + 1} of {questions.length}
          </span>
        </div>

        <p className="question-text">{currentQuestion.question}</p>

        <div className="options">
          {Object.entries(currentQuestion.options).map(([key, value]) => (
            <button
              key={key}
              className={`option ${selectedAnswer === key ? 'selected' : ''}`}
              onClick={() => handleAnswer(currentQuestion.id, key)}
            >
              <span className="option-key">{key}</span>
              <span className="option-text">{value}</span>
            </button>
          ))}
        </div>
      </main>

      <footer className="quiz-nav">
        <button
          className="nav-btn"
          onClick={goToPrev}
          disabled={state.currentIndex === 0}
        >
          Previous
        </button>
        <button className="nav-btn primary" onClick={goToNext}>
          {state.currentIndex === questions.length - 1 ? 'Finish' : 'Next'}
        </button>
      </footer>
    </div>
  )
}

export default App
