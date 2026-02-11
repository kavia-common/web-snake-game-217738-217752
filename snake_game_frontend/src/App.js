import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const GRID_SIZE = 21; // odd size feels centered and classic
const INITIAL_SNAKE = [
  { x: 10, y: 10 },
  { x: 9, y: 10 },
  { x: 8, y: 10 },
];
const INITIAL_DIRECTION = { x: 1, y: 0 }; // moving right
const TICK_MS_DEFAULT = 120;
const MIN_TICK_MS = 60;

/**
 * @typedef {{x:number,y:number}} Point
 */

function pointsEqual(a, b) {
  return a.x === b.x && a.y === b.y;
}

function isOppositeDirection(next, current) {
  return next.x === -current.x && next.y === -current.y;
}

function clampSpeedFromScore(score) {
  // Simple difficulty ramp: speed up every 5 points.
  const speedUpSteps = Math.floor(score / 5);
  return Math.max(MIN_TICK_MS, TICK_MS_DEFAULT - speedUpSteps * 10);
}

function randomIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isPointInSnake(point, snake) {
  return snake.some((s) => pointsEqual(s, point));
}

function spawnFood(gridSize, snake) {
  // Avoid infinite loop when grid is full (unlikely in practice, but safe).
  const maxAttempts = gridSize * gridSize + 5;
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = {
      x: randomIntInclusive(0, gridSize - 1),
      y: randomIntInclusive(0, gridSize - 1),
    };
    if (!isPointInSnake(candidate, snake)) return candidate;
  }
  // Fallback: if no space, return null; game is effectively "won".
  return null;
}

function getNextHead(head, direction) {
  return { x: head.x + direction.x, y: head.y + direction.y };
}

function isOutsideGrid(p, gridSize) {
  return p.x < 0 || p.x >= gridSize || p.y < 0 || p.y >= gridSize;
}

/**
 * Returns true if `head` collides with snake body (excluding the last tail cell
 * when not growing, because the tail will move away on this tick).
 */
function isSelfCollision(nextHead, snake, willGrow) {
  const bodyToCheck = willGrow ? snake : snake.slice(0, -1);
  return bodyToCheck.some((seg) => pointsEqual(seg, nextHead));
}

/**
 * PUBLIC_INTERFACE
 * Main application component for the retro Snake game.
 */
function App() {
  const [snake, setSnake] = useState(INITIAL_SNAKE);
  const [direction, setDirection] = useState(INITIAL_DIRECTION);
  const [pendingDirection, setPendingDirection] = useState(INITIAL_DIRECTION);
  const [food, setFood] = useState(() => spawnFood(GRID_SIZE, INITIAL_SNAKE));
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => {
    const raw = window.localStorage.getItem("snake_best_score");
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const [isRunning, setIsRunning] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [announcement, setAnnouncement] = useState(
    "Welcome to Snake. Press Space to start."
  );

  const intervalRef = useRef(null);
  const lastMoveAtRef = useRef(0);

  const tickMs = useMemo(() => clampSpeedFromScore(score), [score]);

  const gridCells = useMemo(() => {
    // used for rendering; keep stable array length for predictable DOM structure
    return new Array(GRID_SIZE * GRID_SIZE).fill(null);
  }, []);

  const snakeSet = useMemo(() => {
    const set = new Set();
    snake.forEach((p) => set.add(`${p.x},${p.y}`));
    return set;
  }, [snake]);

  const head = snake[0];

  // Persist best score
  useEffect(() => {
    if (score > bestScore) {
      setBestScore(score);
      window.localStorage.setItem("snake_best_score", String(score));
    }
  }, [score, bestScore]);

  // Key controls
  useEffect(() => {
    function onKeyDown(e) {
      const key = e.key;

      // Prevent page scroll on arrow keys while playing.
      if (
        key === "ArrowUp" ||
        key === "ArrowDown" ||
        key === "ArrowLeft" ||
        key === "ArrowRight"
      ) {
        e.preventDefault();
      }

      if (key === " " || key === "Spacebar") {
        e.preventDefault();
        if (isGameOver) {
          restartGame();
          return;
        }
        setIsRunning((prev) => {
          const next = !prev;
          setAnnouncement(next ? "Game started." : "Game paused.");
          return next;
        });
        return;
      }

      if (key === "Enter") {
        if (isGameOver) restartGame();
        return;
      }

      if (key === "r" || key === "R") {
        restartGame();
        return;
      }

      const map = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 },
        s: { x: 0, y: 1 },
        a: { x: -1, y: 0 },
        d: { x: 1, y: 0 },
        W: { x: 0, y: -1 },
        S: { x: 0, y: 1 },
        A: { x: -1, y: 0 },
        D: { x: 1, y: 0 },
      };

      const nextDir = map[key];
      if (!nextDir) return;

      setPendingDirection((prevPending) => {
        // Prevent instantaneous 180-degree reversal.
        if (isOppositeDirection(nextDir, direction)) return prevPending;
        return nextDir;
      });
    }

    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [direction, isGameOver]);

  // Game loop (interval)
  useEffect(() => {
    if (!isRunning || isGameOver) return;

    // Clear any previous interval
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
    }

    intervalRef.current = window.setInterval(() => {
      // Reduce chance of double-moves if the tab is laggy.
      const now = Date.now();
      if (now - lastMoveAtRef.current < Math.max(25, tickMs - 10)) return;
      lastMoveAtRef.current = now;

      setSnake((prevSnake) => {
        if (!food) return prevSnake;

        const nextDirection = pendingDirection;
        // Apply pending direction at tick boundary.
        setDirection(nextDirection);

        const nextHead = getNextHead(prevSnake[0], nextDirection);
        const willEat = pointsEqual(nextHead, food);
        const willGrow = willEat;

        // Wall collision
        if (isOutsideGrid(nextHead, GRID_SIZE)) {
          endGame("Game over: you hit the wall.");
          return prevSnake;
        }

        // Self collision
        if (isSelfCollision(nextHead, prevSnake, willGrow)) {
          endGame("Game over: you ran into yourself.");
          return prevSnake;
        }

        const nextSnake = [nextHead, ...prevSnake];
        if (!willGrow) {
          nextSnake.pop();
        }

        if (willEat) {
          setScore((s) => s + 1);
          const nextFood = spawnFood(GRID_SIZE, nextSnake);
          setFood(nextFood);
          setAnnouncement("Yum! +1 point.");
          if (!nextFood) {
            endGame("You win! The grid is full.");
          }
        }

        return nextSnake;
      });
    }, tickMs);

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [isRunning, isGameOver, tickMs, pendingDirection, food]);

  function endGame(message) {
    setIsRunning(false);
    setIsGameOver(true);
    setAnnouncement(message);
  }

  // PUBLIC_INTERFACE
  function restartGame() {
    const freshSnake = INITIAL_SNAKE;
    setSnake(freshSnake);
    setDirection(INITIAL_DIRECTION);
    setPendingDirection(INITIAL_DIRECTION);
    setFood(spawnFood(GRID_SIZE, freshSnake));
    setScore(0);
    setIsGameOver(false);
    setIsRunning(false);
    setAnnouncement("Restarted. Press Space to start.");
  }

  // Mobile/touch controls
  function requestDirection(nextDir) {
    setPendingDirection((prevPending) => {
      if (isOppositeDirection(nextDir, direction)) return prevPending;
      return nextDir;
    });
  }

  const statusText = isGameOver
    ? "Game over"
    : isRunning
      ? "Running"
      : "Paused";

  return (
    <div className="App">
      <main className="shell">
        <header className="topbar">
          <div className="brand">
            <span className="brandMark" aria-hidden="true">
              SNAKE.exe
            </span>
            <span className="brandSub">retro arcade</span>
          </div>

          <div className="stats" aria-label="Scoreboard">
            <div className="stat">
              <div className="statLabel">SCORE</div>
              <div className="statValue" data-testid="score">
                {score}
              </div>
            </div>
            <div className="stat">
              <div className="statLabel">BEST</div>
              <div className="statValue" data-testid="best-score">
                {bestScore}
              </div>
            </div>
            <div className="stat">
              <div className="statLabel">STATUS</div>
              <div className="statValue" data-testid="status">
                {statusText}
              </div>
            </div>
          </div>

          <div className="actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (isGameOver) {
                  restartGame();
                  return;
                }
                setIsRunning((prev) => {
                  const next = !prev;
                  setAnnouncement(next ? "Game started." : "Game paused.");
                  return next;
                });
              }}
              aria-label={isRunning ? "Pause game" : "Start game"}
            >
              {isRunning ? "Pause" : "Start"}
            </button>

            <button
              type="button"
              className="btn btnSecondary"
              onClick={restartGame}
              aria-label="Restart game"
            >
              Restart
            </button>
          </div>
        </header>

        <section className="content">
          <div className="panel">
            <div className="panelHeader">
              <h1 className="title">Snake</h1>
              <p className="subtitle">
                Eat the pixel. Don’t hit walls. Don’t bite yourself.
              </p>
            </div>

            <div className="gameWrap">
              <div
                className="game"
                role="application"
                aria-label="Snake game board"
                aria-describedby="instructions"
              >
                <div
                  className="grid"
                  style={{
                    ["--grid-size"]: GRID_SIZE,
                  }}
                >
                  {gridCells.map((_, idx) => {
                    const x = idx % GRID_SIZE;
                    const y = Math.floor(idx / GRID_SIZE);
                    const key = `${x},${y}`;

                    const isFood = food ? food.x === x && food.y === y : false;
                    const isSnake = snakeSet.has(key);
                    const isHead = head.x === x && head.y === y;

                    const className = [
                      "cell",
                      isSnake ? "cellSnake" : "",
                      isHead ? "cellHead" : "",
                      isFood ? "cellFood" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    const label = isHead
                      ? "Snake head"
                      : isFood
                        ? "Food"
                        : isSnake
                          ? "Snake body"
                          : "Empty";

                    return (
                      <div
                        key={key}
                        className={className}
                        aria-label={label}
                      />
                    );
                  })}
                </div>

                <div className="srOnly" aria-live="polite" role="status">
                  {announcement}
                </div>

                {isGameOver ? (
                  <div className="overlay" role="dialog" aria-label="Game over">
                    <div className="overlayCard">
                      <div className="overlayTitle">GAME OVER</div>
                      <div className="overlayText">
                        Final score: <strong>{score}</strong>
                      </div>
                      <div className="overlayButtons">
                        <button
                          type="button"
                          className="btn"
                          onClick={restartGame}
                        >
                          Play again
                        </button>
                      </div>
                      <div className="overlayHint">
                        Tip: Press <kbd>Enter</kbd> or <kbd>R</kbd> to restart.
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="controls" aria-label="Controls">
                <div className="controlsTitle">Controls</div>
                <ul className="controlsList" id="instructions">
                  <li>
                    Move: <kbd>Arrow keys</kbd> or <kbd>WASD</kbd>
                  </li>
                  <li>
                    Start/Pause: <kbd>Space</kbd>
                  </li>
                  <li>
                    Restart: <kbd>R</kbd> (or button)
                  </li>
                </ul>

                <div className="touchPad" aria-label="Touch controls">
                  <button
                    type="button"
                    className="padBtn"
                    onClick={() => requestDirection({ x: 0, y: -1 })}
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <div className="padRow">
                    <button
                      type="button"
                      className="padBtn"
                      onClick={() => requestDirection({ x: -1, y: 0 })}
                      aria-label="Move left"
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      className="padBtn padCenter"
                      onClick={() => {
                        if (isGameOver) {
                          restartGame();
                          return;
                        }
                        setIsRunning((prev) => {
                          const next = !prev;
                          setAnnouncement(next ? "Game started." : "Game paused.");
                          return next;
                        });
                      }}
                      aria-label={isRunning ? "Pause game" : "Start game"}
                    >
                      {isRunning ? "⏸" : "▶"}
                    </button>
                    <button
                      type="button"
                      className="padBtn"
                      onClick={() => requestDirection({ x: 1, y: 0 })}
                      aria-label="Move right"
                    >
                      ▶
                    </button>
                  </div>
                  <button
                    type="button"
                    className="padBtn"
                    onClick={() => requestDirection({ x: 0, y: 1 })}
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </div>

                <p className="finePrint">
                  Speed increases as your score grows. Accessible announcements
                  are available for key events.
                </p>
              </div>
            </div>
          </div>

          <footer className="footer">
            <span className="footerText">
              Retro theme inspired by classic arcade displays.
            </span>
          </footer>
        </section>
      </main>
    </div>
  );
}

export default App;
