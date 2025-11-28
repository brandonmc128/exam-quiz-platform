import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { CheckCircle, XCircle, RotateCcw, Database, TrendingUp, Loader, Eye } from 'lucide-react';

const ExamQuizApp = () => {
  // API Base URL
  const API_BASE_URL = 'http://localhost:5000/api';

  // State management
  const [testBanks, setTestBanks] = useState([]);
  const [selectedBank, setSelectedBank] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [showResults, setShowResults] = useState({});
  const [revealedAnswers, setRevealedAnswers] = useState({});
  const [userStats, setUserStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [settings, setSettings] = useState({
    startQuestion: 1,
    endQuestion: 10,
    randomOrder: false,
    wrongAnswersOnly: false,
    wrongThreshold: 1
  });
  const [view, setView] = useState('setup');

  // Load user stats from database
  const loadUserStats = async () => {
    if (!selectedBank) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/user-stats/${selectedBank.name}?user_id=default_user`);
      if (!response.ok) throw new Error('Failed to fetch user stats');
      const stats = await response.json();
      setUserStats(prev => ({
        ...prev,
        [selectedBank.name]: stats
      }));
    } catch (error) {
      console.log('No previous stats found or error loading stats:', error);
    }
  };

  // Save user stats to database
  const saveUserStats = async (bankName, questionId, isCorrect) => {
    try {
      const response = await fetch(`${API_BASE_URL}/user-stats/${bankName}/${questionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: 'default_user',
          is_correct: isCorrect
        })
      });
      
      if (!response.ok) throw new Error('Failed to save stats');
      const updatedStats = await response.json();
      
      // Update local state
      setUserStats(prev => ({
        ...prev,
        [bankName]: {
          ...prev[bankName],
          [questionId]: {
            attempts: updatedStats.attempts,
            correct: updatedStats.correct,
            lastAttempt: updatedStats.lastAttempt
          }
        }
      }));
    } catch (error) {
      console.error('Error saving stats:', error);
    }
  };

  // Connect to database and fetch test banks
  const connectToDatabase = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/test-banks`);
      if (!response.ok) throw new Error('Failed to fetch test banks');
      const banks = await response.json();
      setTestBanks(banks);
    } catch (err) {
      console.error('Error fetching test banks:', err);
      setError('Failed to connect to database. Make sure the API server is running on port 5000.');
    } finally {
      setLoading(false);
    }
  };

  // Load questions from API
  const loadQuestions = async (bankName, start, end, random, wrongOnly = false, wrongThreshold = 1) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/questions/${bankName}?start=${start}&end=${end}&random=${random}`
      );
      if (!response.ok) throw new Error('Failed to fetch questions');
      let questionsData = await response.json();
      
      // Filter for wrong answers only if requested
      if (wrongOnly && userStats[bankName]) {
        questionsData = questionsData.filter(q => {
          const qStats = userStats[bankName][q.id];
          if (!qStats || qStats.attempts === 0) return false;
          
          // Calculate number of wrong answers
          const wrongCount = qStats.attempts - qStats.correct;
          return wrongCount >= wrongThreshold;
        });
        
        if (questionsData.length === 0) {
          setError(`No questions found that you've answered wrong at least ${wrongThreshold} time(s).`);
          setLoading(false);
          return;
        }
      }
      
      setQuestions(questionsData);
      setCurrentQuestionIndex(0);
      setUserAnswers({});
      setShowResults({});
      setRevealedAnswers({});
    } catch (err) {
      console.error('Error fetching questions:', err);
      setError('Failed to load questions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const startQuiz = async () => {
    if (!selectedBank) return;
    
    await loadQuestions(
      selectedBank.name,
      settings.startQuestion,
      settings.endQuestion,
      settings.randomOrder,
      settings.wrongAnswersOnly,
      settings.wrongThreshold
    );
    
    if (questions.length > 0 || !error) {
      setView('quiz');
    }
  };

  const handleAnswerSelect = (questionId, answer) => {
    const currentQuestion = questions[currentQuestionIndex];
    const correctAnswers = currentQuestion.correct_answers.split(',').map(a => a.trim());
    const isMultipleChoice = correctAnswers.length > 1;
    
    setUserAnswers(prev => {
      const currentAnswers = prev[questionId] || [];
      
      if (isMultipleChoice) {
        // Toggle answer for multiple choice
        const newAnswers = currentAnswers.includes(answer)
          ? currentAnswers.filter(a => a !== answer)
          : [...currentAnswers, answer];
        return { ...prev, [questionId]: newAnswers };
      } else {
        // Single choice - replace answer
        return { ...prev, [questionId]: [answer] };
      }
    });
  };

  const revealAnswer = (questionId) => {
    const question = questions.find(q => q.id === questionId);
    const userAnswer = userAnswers[questionId] || [];
    const correctAnswers = question.correct_answers.split(',').map(a => a.trim()).sort();
    const isCorrect = JSON.stringify(userAnswer.sort()) === JSON.stringify(correctAnswers);
    
    setShowResults(prev => ({
      ...prev,
      [questionId]: {
        isCorrect,
        userAnswer,
        correctAnswers
      }
    }));
    
    setRevealedAnswers(prev => ({
      ...prev,
      [questionId]: true
    }));
    
    // Update statistics
    updateStatistics(selectedBank.name, questionId, isCorrect);
  };

  const updateStatistics = (bankName, questionId, isCorrect) => {
    // Save to database
    saveUserStats(bankName, questionId, isCorrect);
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const prevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const resetQuiz = () => {
    setUserAnswers({});
    setShowResults({});
    setRevealedAnswers({});
    setCurrentQuestionIndex(0);
  };

  const resetAllStats = async () => {
    if (!confirm('Are you sure you want to delete ALL your progress across all test banks? This cannot be undone.')) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/user-stats?user_id=default_user`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to reset stats');
      
      setUserStats({});
      alert('All statistics have been reset successfully!');
    } catch (error) {
      console.error('Error resetting stats:', error);
      alert('Failed to reset statistics. Please try again.');
    }
  };

  const resetBankStats = async () => {
    if (!selectedBank) return;
    
    if (!confirm(`Are you sure you want to delete your progress for ${selectedBank.displayName}? This cannot be undone.`)) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/user-stats/${selectedBank.name}?user_id=default_user`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to reset stats');
      
      setUserStats(prev => {
        const newStats = { ...prev };
        delete newStats[selectedBank.name];
        return newStats;
      });
      
      alert(`Statistics for ${selectedBank.displayName} have been reset successfully!`);
      
      // Reload stats
      loadUserStats();
    } catch (error) {
      console.error('Error resetting bank stats:', error);
      alert('Failed to reset statistics. Please try again.');
    }
  };

  const getOverallStats = () => {
    const answeredQuestions = Object.keys(showResults).length;
    const correctAnswers = Object.values(showResults).filter(r => r.isCorrect).length;
    const accuracy = answeredQuestions > 0 ? (correctAnswers / answeredQuestions * 100).toFixed(1) : 0;
    
    return {
      total: questions.length,
      answered: answeredQuestions,
      correct: correctAnswers,
      accuracy
    };
  };

  const getBankStats = () => {
    if (!selectedBank || !userStats[selectedBank.name]) {
      return { totalAttempts: 0, totalCorrect: 0, accuracy: 0 };
    }
    
    const bankStats = userStats[selectedBank.name];
    const stats = Object.values(bankStats);
    const totalAttempts = stats.reduce((sum, s) => sum + s.attempts, 0);
    const totalCorrect = stats.reduce((sum, s) => sum + s.correct, 0);
    const accuracy = totalAttempts > 0 ? (totalCorrect / totalAttempts * 100).toFixed(1) : 0;
    
    return { totalAttempts, totalCorrect, accuracy };
  };

  useEffect(() => {
    connectToDatabase();
  }, []);

  // Load stats when bank is selected
  useEffect(() => {
    if (selectedBank) {
      loadUserStats();
    }
  }, [selectedBank]);

  useEffect(() => {
    if (questions.length > 0 && view === 'setup') {
      setView('quiz');
    }
  }, [questions]);

  const currentQuestion = questions[currentQuestionIndex];
  const stats = getOverallStats();
  const bankStats = getBankStats();

  // Loading Screen
  if (loading && view === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading test banks...</p>
        </div>
      </div>
    );
  }

  // Setup View
  if (view === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <Database className="w-8 h-8 text-indigo-600" />
              <h1 className="text-3xl font-bold text-gray-800">Exam Quiz Platform</h1>
            </div>
            
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800">{error}</p>
                <button
                  onClick={connectToDatabase}
                  className="mt-2 text-sm text-red-600 underline hover:text-red-800"
                >
                  Try again
                </button>
              </div>
            )}
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Test Bank
                </label>
                <select
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  value={selectedBank?.name || ''}
                  onChange={(e) => {
                    const bank = testBanks.find(b => b.name === e.target.value);
                    setSelectedBank(bank);
                    setSettings(prev => ({
                      ...prev,
                      endQuestion: Math.min(prev.endQuestion, bank?.totalQuestions || 10)
                    }));
                  }}
                >
                  <option value="">Choose a test bank...</option>
                  {testBanks.map(bank => (
                    <option key={bank.name} value={bank.name}>
                      {bank.displayName} ({bank.totalQuestions} questions)
                    </option>
                  ))}
                </select>
              </div>

              {selectedBank && (
                <>
                  {userStats[selectedBank.name] && (
                    <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-semibold text-indigo-900">Your Performance</h3>
                        <button
                          onClick={resetBankStats}
                          className="text-xs text-red-600 hover:text-red-800 underline"
                        >
                          Reset Stats
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="text-2xl font-bold text-indigo-600">{bankStats.totalAttempts}</div>
                          <div className="text-xs text-gray-600">Total Attempts</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-green-600">{bankStats.totalCorrect}</div>
                          <div className="text-xs text-gray-600">Correct</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-indigo-600">{bankStats.accuracy}%</div>
                          <div className="text-xs text-gray-600">Accuracy</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Start Question
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={selectedBank.totalQuestions}
                        value={settings.startQuestion}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          startQuestion: parseInt(e.target.value) || 1
                        }))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        End Question
                      </label>
                      <input
                        type="number"
                        min={settings.startQuestion}
                        max={selectedBank.totalQuestions}
                        value={settings.endQuestion}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          endQuestion: parseInt(e.target.value) || 10
                        }))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="randomOrder"
                        checked={settings.randomOrder}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          randomOrder: e.target.checked
                        }))}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      <label htmlFor="randomOrder" className="text-sm font-medium text-gray-700">
                        Randomize question order
                      </label>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="wrongAnswersOnly"
                          checked={settings.wrongAnswersOnly}
                          onChange={(e) => setSettings(prev => ({
                            ...prev,
                            wrongAnswersOnly: e.target.checked
                          }))}
                          className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <label htmlFor="wrongAnswersOnly" className="text-sm font-medium text-gray-700">
                          Practice wrong answers only
                        </label>
                      </div>
                      
                      {settings.wrongAnswersOnly && (
                        <div className="ml-7 flex items-center gap-3">
                          <label htmlFor="wrongThreshold" className="text-sm text-gray-600">
                            Wrong at least
                          </label>
                          <input
                            type="number"
                            id="wrongThreshold"
                            min="1"
                            max="20"
                            value={settings.wrongThreshold || 1}
                            onChange={(e) => setSettings(prev => ({
                              ...prev,
                              wrongThreshold: parseInt(e.target.value) || 1
                            }))}
                            className="w-20 px-3 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          />
                          <span className="text-sm text-gray-600">time(s)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={startQuiz}
                    disabled={loading}
                    className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader className="w-5 h-5 animate-spin" />
                        Loading Questions...
                      </>
                    ) : (
                      <>
                        Start Quiz 
                        {settings.wrongAnswersOnly 
                          ? ` (Wrong ≥${settings.wrongThreshold}x)` 
                          : ` (${settings.endQuestion - settings.startQuestion + 1} questions)`
                        }
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Quiz View
  if (view === 'quiz' && currentQuestion) {
    const result = showResults[currentQuestion.id];
    const revealed = revealedAnswers[currentQuestion.id];
    const userAnswer = userAnswers[currentQuestion.id] || [];
    const correctAnswers = currentQuestion.correct_answers.split(',').map(a => a.trim());
    const isMultipleChoice = correctAnswers.length > 1;
    const answers = ['A', 'B', 'C', 'D', 'E', 'F'].filter(letter => 
      currentQuestion[`answer_${letter.toLowerCase()}`]
    );

    // Get question stats
    const questionStats = userStats[selectedBank?.name]?.[currentQuestion.id];

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header with Stats */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">{selectedBank?.displayName}</h2>
                <p className="text-gray-600">Question {currentQuestionIndex + 1} of {questions.length}</p>
                {questionStats && (
                  <p className="text-sm text-gray-500 mt-1">
                    Previous attempts: {questionStats.attempts} | Correct: {questionStats.correct}
                  </p>
                )}
              </div>
              <div className="flex gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{stats.correct}</div>
                  <div className="text-sm text-gray-600">Correct</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{stats.answered - stats.correct}</div>
                  <div className="text-sm text-gray-600">Wrong</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-indigo-600">{stats.accuracy}%</div>
                  <div className="text-sm text-gray-600">Accuracy</div>
                </div>
              </div>
            </div>
          </div>

          {/* Question Card */}
          <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
            {isMultipleChoice && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm font-medium text-yellow-800">
                  ⚠️ Multiple answers required - Select {correctAnswers.length} options
                </p>
              </div>
            )}

            {currentQuestion.question_image_url && (
              <img 
                src={currentQuestion.question_image_url} 
                alt="Question" 
                className="mb-4 max-w-full rounded-lg"
              />
            )}

            {currentQuestion.question_image_base64 && currentQuestion.question_image_type && (
              <img 
                src={`data:${currentQuestion.question_image_type};base64,${currentQuestion.question_image_base64}`}
                alt="Question" 
                className="mb-4 max-w-full rounded-lg"
              />
            )}

            <h3 className="text-xl font-semibold text-gray-800 mb-6">
              {currentQuestion.question_text}
            </h3>

            <div className="space-y-3">
              {answers.map(letter => {
                const answerText = currentQuestion[`answer_${letter.toLowerCase()}`];
                const isSelected = userAnswer.includes(letter);
                const isCorrect = correctAnswers.includes(letter);
                const showFeedback = revealed && isSelected;
                
                let bgColor = 'bg-gray-50 hover:bg-gray-100';
                let borderColor = 'border-gray-300';
                let textColor = 'text-gray-800';
                
                if (isSelected) {
                  bgColor = 'bg-indigo-50';
                  borderColor = 'border-indigo-500';
                }
                
                if (showFeedback) {
                  if (isCorrect) {
                    bgColor = 'bg-green-50';
                    borderColor = 'border-green-500';
                    textColor = 'text-green-800';
                  } else {
                    bgColor = 'bg-red-50';
                    borderColor = 'border-red-500';
                    textColor = 'text-red-800';
                  }
                }

                return (
                  <button
                    key={letter}
                    onClick={() => !revealed && handleAnswerSelect(currentQuestion.id, letter)}
                    disabled={revealed}
                    className={`w-full text-left p-4 border-2 rounded-lg transition-all ${bgColor} ${borderColor} ${textColor} ${revealed ? 'cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="font-bold text-lg">{letter}.</span>
                      <span className="flex-1">{answerText}</span>
                      {showFeedback && (
                        isCorrect ? 
                          <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" /> :
                          <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {!revealed && userAnswer.length > 0 && (
              <button
                onClick={() => revealAnswer(currentQuestion.id)}
                className="mt-6 w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              >
                <Eye className="w-5 h-5" />
                Reveal Answer
              </button>
            )}

            {revealed && result && !result.isCorrect && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-800">
                  ✓ Correct answer(s): {correctAnswers.join(', ')}
                </p>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center">
            <button
              onClick={prevQuestion}
              disabled={currentQuestionIndex === 0}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors"
            >
              Previous
            </button>

            <div className="flex gap-3">
              <button
                onClick={resetQuiz}
                className="px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
              <button
                onClick={() => setView('stats')}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
              >
                <TrendingUp className="w-4 h-4" />
                Statistics
              </button>
              <button
                onClick={() => setView('setup')}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Change Test
              </button>
            </div>

            <button
              onClick={nextQuestion}
              disabled={currentQuestionIndex === questions.length - 1}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Statistics View
  if (view === 'stats') {
    const chartData = questions.map((q, idx) => {
      const result = showResults[q.id];
      return {
        name: `Q${idx + 1}`,
        status: result ? (result.isCorrect ? 1 : 0) : null
      };
    }).filter(d => d.status !== null);

    const pieData = [
      { name: 'Correct', value: stats.correct, color: '#10b981' },
      { name: 'Incorrect', value: stats.answered - stats.correct, color: '#ef4444' },
      { name: 'Unanswered', value: stats.total - stats.answered, color: '#6b7280' }
    ];

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-lg shadow-xl p-8">
            <div className="flex justify-between items-center mb-8">
              <h1 className="text-3xl font-bold text-gray-800">Quiz Statistics</h1>
              <div className="flex gap-3">
                <button
                  onClick={resetAllStats}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                >
                  Reset All Stats
                </button>
                <button
                  onClick={() => setView('quiz')}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Back to Quiz
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-6 mb-8">
              <div className="bg-blue-50 p-6 rounded-lg">
                <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
                <div className="text-sm text-gray-600">Total Questions</div>
              </div>
              <div className="bg-green-50 p-6 rounded-lg">
                <div className="text-3xl font-bold text-green-600">{stats.correct}</div>
                <div className="text-sm text-gray-600">Correct</div>
              </div>
              <div className="bg-red-50 p-6 rounded-lg">
                <div className="text-3xl font-bold text-red-600">{stats.answered - stats.correct}</div>
                <div className="text-sm text-gray-600">Incorrect</div>
              </div>
              <div className="bg-indigo-50 p-6 rounded-lg">
                <div className="text-3xl font-bold text-indigo-600">{stats.accuracy}%</div>
                <div className="text-sm text-gray-600">Accuracy</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <h3 className="text-xl font-semibold mb-4">Performance by Question</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis domain={[0, 1]} ticks={[0, 1]} />
                    <Tooltip />
                    <Bar dataKey="status" fill="#4f46e5" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-4">Overall Distribution</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-4">Detailed Results</h3>
              <div className="space-y-2">
                {questions.map((q, idx) => {
                  const result = showResults[q.id];
                  const histStats = userStats[selectedBank?.name]?.[q.id];
                  return (
                    <div key={q.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="font-medium">Q{idx + 1}</span>
                      <span className="text-sm text-gray-600 flex-1 mx-4 truncate">{q.question_text}</span>
                      {histStats && (
                        <span className="text-xs text-gray-500 mr-4">
                          {histStats.correct}/{histStats.attempts}
                        </span>
                      )}
                      {result ? (
                        result.isCorrect ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-600" />
                        )
                      ) : (
                        <span className="text-gray-400 text-sm">Not answered</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default ExamQuizApp;
