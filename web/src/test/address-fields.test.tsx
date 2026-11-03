import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { AddressFields } from '../components/AddressBook';
import type { AddressInput } from '../api/hooks';
import { addressRules } from '../lib/addresses';

function Form() {
  const [draft, setDraft] = useState<AddressInput>({ label: 'Home', countryCode: 'BD', recipientName: 'Buyer',
    phone: '', division: 'Dhaka', district: 'Dhaka', upazila: 'Dhanmondi', addressLine: 'House 42', isDefault: true });
  return <AddressFields draft={draft} setDraft={setDraft} errors={{}} />;
}

it('switches country fields and clears location values while preserving street and recipient', async () => {
  const user = userEvent.setup(); render(<Form />);
  await user.selectOptions(screen.getByLabelText(/country \/ region/i), 'US');
  expect(screen.getByLabelText('State')).toHaveValue('');
  expect(screen.getByLabelText('ZIP code')).toBeRequired();
  expect(screen.getByLabelText('Address line')).toHaveValue('House 42');
  expect(screen.getByLabelText('Recipient name')).toHaveValue('Buyer');
  await user.selectOptions(screen.getByLabelText(/country \/ region/i), 'GB');
  expect(screen.queryByLabelText('State')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Town / city')).toBeRequired();
  expect(screen.getByLabelText('Postal code')).toBeRequired();
  await user.selectOptions(screen.getByLabelText(/country \/ region/i), 'AE');
  expect(screen.getByLabelText('Emirate')).toBeRequired();
  expect(screen.queryByLabelText('Postal code')).not.toBeInTheDocument();
});

it('accepts unlisted Bangladesh areas and clears dependent locations when a parent changes', async () => {
  const user = userEvent.setup(); render(<Form />);
  const area = screen.getByLabelText('Area / thana / upazila');
  await user.clear(area); await user.type(area, 'Custom village');
  expect(area).toHaveValue('Custom village');
  await user.clear(screen.getByLabelText('Division'));
  expect(screen.getByLabelText('District')).toHaveValue('');
  expect(area).toHaveValue('');
});

it('uses country metadata rather than imposing Bangladesh requirements internationally', () => {
  expect(addressRules('US')).toMatchObject({ regionRequired: true, postalRequired: true, bd: false });
  expect(addressRules('GB')).toMatchObject({ region: false, cityRequired: true });
  expect(addressRules('AE')).toMatchObject({ city: false, postal: false });
});
