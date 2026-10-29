import { fireEvent, render, screen } from '@testing-library/react-native';
import { NutritionTable } from '@/components/NutritionTable';
import { StarRating } from '@/components/StarRating';
import { EmptyState, ErrorState } from '@/components/States';
import { ApiError } from '@/services/api';

describe('StarRating', () => {
  it('announces the rating for screen readers', async () => {
    await render(<StarRating stars={3.5} status="RATED" />);
    expect(screen.getByLabelText('3.5 out of 5 stars')).toBeTruthy();
    expect(screen.getByText('3.5')).toBeTruthy();
  });
  it('explains why there is no rating', async () => {
    await render(<StarRating stars={null} status="EXEMPT" />);
    expect(screen.getByText('Not rated - exempt category')).toBeTruthy();
  });
  it('marks partial ratings', async () => {
    await render(<StarRating stars={2.5} status="PARTIAL" />);
    expect(screen.getByLabelText('2.5 out of 5 stars, partial rating')).toBeTruthy();
  });
});

describe('NutritionTable', () => {
  it('shows missing values as "not reported", not zero', async () => {
    await render(
      <NutritionTable
        basisLabel="per 100 g"
        values={{ energyKcal: 454, fatG: 13, saturatedFatG: 6, transFatG: null, carbohydratesG: 77.3, sugarsG: 25, fiberG: null, proteinG: 7, sodiumMg: 0, fruitVegPct: null, nutsLegumesMilletsPct: null }}
      />,
    );
    expect(screen.getByText('454 kcal')).toBeTruthy();
    expect(screen.getByText('0 mg')).toBeTruthy();
    expect(screen.getAllByText('not reported')).toHaveLength(1); // fibre (trans fat row hidden when unknown)
  });
});

describe('error and empty states', () => {
  it('explains a network failure and offers retry', async () => {
    const retry = jest.fn();
    await render(<ErrorState error={new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the NutriScan server.')} onRetry={retry} />);
    expect(screen.getByText('Cannot reach NutriScan')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });
  it('shows a database outage distinctly', async () => {
    await render(<ErrorState error={new ApiError(503, 'DATABASE_UNAVAILABLE', 'The product database is temporarily unavailable.')} />);
    expect(screen.getByText('Database unavailable')).toBeTruthy();
  });
  it('renders an empty state action', async () => {
    const onAction = jest.fn();
    await render(<EmptyState title="No favourites yet" action="Browse" onAction={onAction} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Browse' }));
    expect(onAction).toHaveBeenCalled();
  });
});
