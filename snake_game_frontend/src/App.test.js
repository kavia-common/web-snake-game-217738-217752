import { render, screen, fireEvent, act } from "@testing-library/react";
import App from "./App";

beforeEach(() => {
  window.localStorage.clear();
});

test("renders scoreboard and controls", () => {
  render(<App />);
  expect(screen.getByText(/Snake/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Scoreboard/i)).toBeInTheDocument();
  expect(screen.getByTestId("score")).toHaveTextContent("0");
  expect(screen.getByRole("button", { name: /Start game/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Restart game/i })).toBeInTheDocument();
});

test("space toggles running status", () => {
  render(<App />);
  expect(screen.getByTestId("status")).toHaveTextContent(/Paused/i);

  fireEvent.keyDown(window, { key: " " });
  expect(screen.getByTestId("status")).toHaveTextContent(/Running/i);

  fireEvent.keyDown(window, { key: " " });
  expect(screen.getByTestId("status")).toHaveTextContent(/Paused/i);
});

test("restart resets score to zero after some ticks", () => {
  jest.useFakeTimers();

  render(<App />);
  fireEvent.keyDown(window, { key: " " }); // start

  // advance a few ticks (snake moves, score may or may not change; restart must reset to 0)
  act(() => {
    jest.advanceTimersByTime(500);
  });

  fireEvent.click(screen.getByRole("button", { name: /Restart game/i }));
  expect(screen.getByTestId("score")).toHaveTextContent("0");
  expect(screen.getByTestId("status")).toHaveTextContent(/Paused/i);

  jest.useRealTimers();
});
