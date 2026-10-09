import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpandableText } from '../ExpandableText';

const MAX_LENGTH = 150;

/**
 * Texto largo determinista: 500 caracteres. El sufijo "RESTO" sólo aparece
 * pasada la posición 150, así que distingue el estado truncado del expandido.
 */
const LONG_TEXT = 'Objetivo: '.concat('lorem ipsum dolor sit amet '.repeat(20)).slice(0, 500);
const TRUNCATED_LONG = `${LONG_TEXT.slice(0, MAX_LENGTH)}...`;

const TEXT_A = `${'a'.repeat(MAX_LENGTH)}-campo-a`;
const TEXT_B = `${'b'.repeat(MAX_LENGTH)}-campo-b`;

describe('ExpandableText', () => {
  it('renderiza completo un texto corto sin botón', () => {
    const shortText = 'Control de rutina sin hallazgos.';

    render(<ExpandableText text={shortText} />);

    expect(screen.getByText(shortText)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('no muestra botón con exactamente 150 caracteres (borde inferior)', () => {
    const boundaryText = 'x'.repeat(MAX_LENGTH);

    render(<ExpandableText text={boundaryText} />);

    expect(screen.getByText(boundaryText)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('trunca a 150 caracteres más "..." con botón "Ver más" y aria-expanded="false"', () => {
    render(<ExpandableText text={LONG_TEXT} />);

    expect(screen.getByText(TRUNCATED_LONG)).toBeInTheDocument();
    expect(screen.queryByText(LONG_TEXT)).not.toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Ver más' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('muestra el botón "Ver más" con 151 caracteres (borde superior)', () => {
    const boundaryText = 'y'.repeat(MAX_LENGTH + 1);

    render(<ExpandableText text={boundaryText} />);

    expect(screen.getByText(`${'y'.repeat(MAX_LENGTH)}...`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver más' })).toBeInTheDocument();
  });

  it('expande al hacer clic en "Ver más" y cambia a "Ver menos"', async () => {
    const user = userEvent.setup();

    render(<ExpandableText text={LONG_TEXT} />);

    await user.click(screen.getByRole('button', { name: 'Ver más' }));

    expect(screen.getByText(LONG_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(TRUNCATED_LONG)).not.toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Ver menos' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('colapsa de nuevo al hacer clic en "Ver menos"', async () => {
    const user = userEvent.setup();

    render(<ExpandableText text={LONG_TEXT} />);

    await user.click(screen.getByRole('button', { name: 'Ver más' }));
    await user.click(screen.getByRole('button', { name: 'Ver menos' }));

    expect(screen.getByText(TRUNCATED_LONG)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Ver más' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('renderiza el fallback "—" para texto null sin botón', () => {
    render(<ExpandableText text={null} />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('mantiene el estado de expansión independiente entre instancias', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <div data-testid="campo-a">
          <ExpandableText text={TEXT_A} />
        </div>
        <div data-testid="campo-b">
          <ExpandableText text={TEXT_B} />
        </div>
      </div>
    );

    const fieldA = screen.getByTestId('campo-a');
    const fieldB = screen.getByTestId('campo-b');

    await user.click(within(fieldA).getByRole('button', { name: 'Ver más' }));

    expect(within(fieldA).getByText(TEXT_A)).toBeInTheDocument();
    expect(within(fieldA).getByRole('button', { name: 'Ver menos' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    // El segundo campo permanece truncado y sin expandir.
    expect(within(fieldB).getByText(`${TEXT_B.slice(0, MAX_LENGTH)}...`)).toBeInTheDocument();
    expect(within(fieldB).getByRole('button', { name: 'Ver más' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });
});
