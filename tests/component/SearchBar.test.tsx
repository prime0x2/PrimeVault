// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SearchBar } from '~/features/vault/SearchBar';

describe('SearchBar', () => {
  it('shows just the total when there is no active query', () => {
    render(<SearchBar value="" onChange={vi.fn()} count={42} total={42} />);
    expect(screen.getByRole('status').textContent).toBe('42');
  });

  it('shows "matched / total" when filtering', () => {
    render(<SearchBar value="git" onChange={vi.fn()} count={3} total={42} />);
    expect(screen.getByRole('status').textContent).toBe('3 / 42');
  });

  it('hides the clear button while the query is empty', () => {
    render(<SearchBar value="" onChange={vi.fn()} count={0} total={0} />);
    expect(screen.queryByRole('button', { name: /clear search/i })).toBeNull();
  });

  it('calls onChange("") when the clear button is clicked', async () => {
    const onChange = vi.fn();
    render(
      <SearchBar value="github" onChange={onChange} count={1} total={5} />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /clear search/i }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('clears on Escape when there is a query', async () => {
    const onChange = vi.fn();
    render(
      <SearchBar value="github" onChange={onChange} count={1} total={5} />,
    );
    const input = screen.getByLabelText(/search entries/i);
    input.focus();
    await userEvent.setup().keyboard('{Escape}');
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('ignores Escape when the query is already empty', async () => {
    const onChange = vi.fn();
    render(<SearchBar value="" onChange={onChange} count={0} total={0} />);
    const input = screen.getByLabelText(/search entries/i);
    input.focus();
    await userEvent.setup().keyboard('{Escape}');
    expect(onChange).not.toHaveBeenCalled();
  });
});
