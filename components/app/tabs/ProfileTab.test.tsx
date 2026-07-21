// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { InlineProfile } from '../types';
import { renderWithShell } from '../test-helpers/render-with-shell';
import { ProfileTab } from './ProfileTab';

const baseProfile: InlineProfile = {
  id: 'user-1',
  email: 'a@b.com',
  fullName: 'Fulano',
  phone: '11999999999',
  role: 'user',
  companyName: '',
  companyAddress: '',
  companyLogoUrl: '',
};

/** ProfileTab is fully controlled (profile, deleteAccountOpen, deleteConfirmText
 *  all come in as props); this wrapper plays the role of SinglePageApp/
 *  useProfileActions so interactive flows (typing, opening the delete
 *  confirmation) behave like they do in the real app. */
function ControlledProfileTab(overrides: {
  saveProfile?: (e: React.FormEvent<HTMLFormElement>) => void;
  signOut?: () => void;
  deleteAccount?: () => void;
  profileSaving?: boolean;
  profileMessage?: string | null;
  profileError?: string | null;
  deletingAccount?: boolean;
  deleteAccountError?: string | null;
}) {
  const [profile, setProfile] = useState(baseProfile);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(overrides.deleteAccountError ?? null);

  return (
    <ProfileTab
      profile={profile}
      setProfile={setProfile}
      profileSaving={overrides.profileSaving ?? false}
      profileMessage={overrides.profileMessage ?? null}
      profileError={overrides.profileError ?? null}
      saveProfile={overrides.saveProfile ?? vi.fn()}
      uploadCompanyLogo={vi.fn()}
      signOut={overrides.signOut ?? vi.fn()}
      deleteAccountOpen={deleteAccountOpen}
      setDeleteAccountOpen={setDeleteAccountOpen}
      deleteConfirmText={deleteConfirmText}
      setDeleteConfirmText={setDeleteConfirmText}
      deletingAccount={overrides.deletingAccount ?? false}
      deleteAccountError={deleteAccountError}
      setDeleteAccountError={setDeleteAccountError}
      deleteAccount={overrides.deleteAccount ?? vi.fn()}
    />
  );
}

describe('ProfileTab: fields', () => {
  it('renders the current profile values', () => {
    renderWithShell(<ControlledProfileTab />);
    expect(screen.getByLabelText('Email')).toHaveValue('a@b.com');
    expect(screen.getByLabelText('Nome')).toHaveValue('Fulano');
    expect(screen.getByLabelText('Telefone')).toHaveValue('11999999999');
  });

  it('shows the profile message and error when present', () => {
    renderWithShell(<ControlledProfileTab profileMessage="Perfil atualizado." profileError="Algo deu errado." />);
    expect(screen.getByRole('status')).toHaveTextContent('Perfil atualizado.');
    expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado.');
  });

  it('calls signOut when Sair is clicked', () => {
    const signOut = vi.fn();
    renderWithShell(<ControlledProfileTab signOut={signOut} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(signOut).toHaveBeenCalled();
  });

  it('calls saveProfile on submit', () => {
    const saveProfile = vi.fn((e: React.FormEvent<HTMLFormElement>) => e.preventDefault());
    renderWithShell(<ControlledProfileTab saveProfile={saveProfile} />);
    fireEvent.click(screen.getByRole('button', { name: /Salvar perfil/ }));
    expect(saveProfile).toHaveBeenCalled();
  });

  it('edits name, phone, company name/address/logo URL, and shows the logo preview once a URL is set', () => {
    renderWithShell(<ControlledProfileTab />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Fulano de Tal' } });
    expect(screen.getByLabelText('Nome')).toHaveValue('Fulano de Tal');

    fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '11888888888' } });
    expect(screen.getByLabelText('Telefone')).toHaveValue('11888888888');

    fireEvent.change(screen.getByLabelText('Nome da empresa'), { target: { value: 'Solax Ltda' } });
    expect(screen.getByLabelText('Nome da empresa')).toHaveValue('Solax Ltda');

    fireEvent.change(screen.getByLabelText('Endereço da empresa'), { target: { value: 'Rua X, 123' } });
    expect(screen.getByLabelText('Endereço da empresa')).toHaveValue('Rua X, 123');

    expect(screen.queryByAltText('Logomarca da empresa')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Logomarca'), { target: { value: 'https://cdn.example.com/logo.png' } });
    expect(screen.getByAltText('Logomarca da empresa')).toHaveAttribute('src', 'https://cdn.example.com/logo.png');
  });

  it('uploads a company logo file', () => {
    const uploadCompanyLogo = vi.fn();
    function Wrapper() {
      const [profile, setProfile] = useState(baseProfile);
      return (
        <ProfileTab
          profile={profile}
          setProfile={setProfile}
          profileSaving={false}
          profileMessage={null}
          profileError={null}
          saveProfile={vi.fn()}
          uploadCompanyLogo={uploadCompanyLogo}
          signOut={vi.fn()}
          deleteAccountOpen={false}
          setDeleteAccountOpen={vi.fn()}
          deleteConfirmText=""
          setDeleteConfirmText={vi.fn()}
          deletingAccount={false}
          deleteAccountError={null}
          setDeleteAccountError={vi.fn()}
          deleteAccount={vi.fn()}
        />
      );
    }
    renderWithShell(<Wrapper />);

    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(uploadCompanyLogo).toHaveBeenCalledWith(file);
  });
});

describe('ProfileTab: delete account flow', () => {
  it('requires typing EXCLUIR before the confirm button is enabled', () => {
    renderWithShell(<ControlledProfileTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir minha conta' }));
    const confirmButton = screen.getByRole('button', { name: /Confirmar exclusão definitiva/ });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Digite/), { target: { value: 'excluir' } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Digite/), { target: { value: 'EXCLUIR' } });
    expect(confirmButton).toBeEnabled();
  });

  it('calls deleteAccount once confirmed', () => {
    const deleteAccount = vi.fn();
    renderWithShell(<ControlledProfileTab deleteAccount={deleteAccount} />);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir minha conta' }));
    fireEvent.change(screen.getByLabelText(/Digite/), { target: { value: 'EXCLUIR' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar exclusão definitiva/ }));

    expect(deleteAccount).toHaveBeenCalled();
  });

  it('Cancelar closes the confirmation and clears the typed text', () => {
    renderWithShell(<ControlledProfileTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir minha conta' }));
    fireEvent.change(screen.getByLabelText(/Digite/), { target: { value: 'EXCLUIR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByLabelText(/Digite/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir minha conta' })).toBeInTheDocument();
  });

  it('shows the delete error and disables confirm while deleting', () => {
    renderWithShell(<ControlledProfileTab deletingAccount deleteAccountError="Não foi possível excluir a conta." />);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir minha conta' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível excluir a conta.');
    expect(screen.getByRole('button', { name: 'Excluindo...' })).toBeDisabled();
  });
});
