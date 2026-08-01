// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PhotoUploadField } from './PhotoUploadField';

function makeFile() {
  return new File(['data'], 'photo.png', { type: 'image/png' });
}

describe('PhotoUploadField', () => {
  it('renders the empty state and uploads a file, calling onChange with the resulting url', async () => {
    const onUploadPhoto = vi.fn().mockResolvedValue('https://example.com/photo.png');
    const onChange = vi.fn();
    render(
      <PhotoUploadField label="Foto do disjuntor" photoUrl={null} slot="ats" onUploadPhoto={onUploadPhoto} onChange={onChange} />
    );

    expect(screen.getByText('Anexar foto')).toBeInTheDocument();
    const input = document.getElementById('photo-upload-ats') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('https://example.com/photo.png'));
    expect(onUploadPhoto).toHaveBeenCalledWith(expect.any(File), 'ats');
  });

  it('shows an error message when the upload rejects', async () => {
    const onUploadPhoto = vi.fn().mockRejectedValue(new Error('boom'));
    const onChange = vi.fn();
    render(
      <PhotoUploadField label="Foto" photoUrl={null} slot="microgrid" onUploadPhoto={onUploadPhoto} onChange={onChange} />
    );

    const input = document.getElementById('photo-upload-microgrid') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() =>
      expect(screen.getByText('Não foi possível enviar a imagem. Tente novamente.')).toBeInTheDocument()
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing when no file is selected in the change event', () => {
    const onUploadPhoto = vi.fn();
    const onChange = vi.fn();
    render(
      <PhotoUploadField label="Foto" photoUrl={null} slot="generator" onUploadPhoto={onUploadPhoto} onChange={onChange} />
    );
    const input = document.getElementById('photo-upload-generator') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(onUploadPhoto).not.toHaveBeenCalled();
  });

  it('renders the filled state with change/remove actions when photoUrl is set', () => {
    const onChange = vi.fn();
    render(
      <PhotoUploadField
        label="Foto do gerador"
        photoUrl="https://example.com/existing.png"
        slot="generator"
        onUploadPhoto={vi.fn()}
        onChange={onChange}
      />
    );
    expect(screen.getByAltText('Foto do gerador')).toBeInTheDocument();
    expect(screen.getByText('Trocar foto')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Remover'));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
