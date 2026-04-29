import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import FgFormField from '@/components/designSystem/molecules/FgFormField';

describe('FgFormField', () => {
  it('renders children', () => {
    render(
      <FgFormField label="Name">
        <input placeholder="Child input" />
      </FgFormField>
    );

    expect(screen.getByPlaceholderText('Child input')).toBeInTheDocument();
  });

  it('renders label', () => {
    render(
      <FgFormField label="Email">
        <input />
      </FgFormField>
    );

    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Email').tagName).toBe('LABEL');
  });

  it('auto-generates id on child and matching htmlFor on label', () => {
    render(
      <FgFormField label="Email">
        <input placeholder="Email" />
      </FgFormField>
    );

    const input = screen.getByPlaceholderText('Email');
    const label = screen.getByText('Email');
    expect(input).toHaveAttribute('id');
    expect(label).toHaveAttribute('for', input.getAttribute('id'));
  });

  it('uses htmlFor as override when provided', () => {
    render(
      <FgFormField label="Email" htmlFor="email-input">
        <input placeholder="Email" />
      </FgFormField>
    );

    const input = screen.getByPlaceholderText('Email');
    const label = screen.getByText('Email');
    expect(input).toHaveAttribute('id', 'email-input');
    expect(label).toHaveAttribute('for', 'email-input');
  });

  it('renders optional indicator when optional=true', () => {
    render(
      <FgFormField label="Nickname" optional>
        <input />
      </FgFormField>
    );

    expect(screen.getByText('(optional)')).toBeInTheDocument();
  });

  it('renders error message when error provided', () => {
    render(
      <FgFormField label="Name" error="This field is required">
        <input />
      </FgFormField>
    );

    const errorText = screen.getByText('This field is required');
    expect(errorText).toBeInTheDocument();
    expect(errorText).toHaveClass('text-error');
  });

  it('error message has id derived from field id', () => {
    render(
      <FgFormField label="Email" htmlFor="email" error="Required">
        <input />
      </FgFormField>
    );

    expect(screen.getByText('Required')).toHaveAttribute('id', 'email-error');
  });

  it('error message id uses auto-generated id when htmlFor not provided', () => {
    render(
      <FgFormField label="Email" error="Required">
        <input placeholder="Email" />
      </FgFormField>
    );

    const input = screen.getByPlaceholderText('Email');
    const fieldId = input.getAttribute('id');
    expect(screen.getByText('Required')).toHaveAttribute(
      'id',
      `${fieldId}-error`
    );
  });

  it('does not render error when not provided', () => {
    const { container } = render(
      <FgFormField label="Name">
        <input />
      </FgFormField>
    );

    const errorElements = container.querySelectorAll('.text-error');
    expect(errorElements.length).toBe(0);
  });

  it('renders helper text when provided', () => {
    render(
      <FgFormField label="Name" helperText="Enter your full name">
        <input />
      </FgFormField>
    );

    expect(screen.getByText('Enter your full name')).toBeInTheDocument();
  });

  it('helper text has id derived from field id', () => {
    render(
      <FgFormField label="Password" htmlFor="pw" helperText="Must be 8+ chars">
        <input />
      </FgFormField>
    );

    expect(screen.getByText('Must be 8+ chars')).toHaveAttribute(
      'id',
      'pw-helper'
    );
  });

  it('sets aria-invalid on child when error is present', () => {
    render(
      <FgFormField label="Name" error="Required">
        <input placeholder="Name" />
      </FgFormField>
    );

    expect(screen.getByPlaceholderText('Name')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
  });

  it('does not set aria-invalid when no error', () => {
    render(
      <FgFormField label="Name">
        <input placeholder="Name" />
      </FgFormField>
    );

    expect(screen.getByPlaceholderText('Name')).not.toHaveAttribute(
      'aria-invalid'
    );
  });

  it('sets aria-describedby on child referencing error', () => {
    render(
      <FgFormField label="Name" htmlFor="name" error="Required">
        <input placeholder="Name" />
      </FgFormField>
    );

    expect(screen.getByPlaceholderText('Name')).toHaveAttribute(
      'aria-describedby',
      'name-error'
    );
  });

  it('sets aria-describedby on child referencing helper text', () => {
    render(
      <FgFormField label="Name" htmlFor="name" helperText="Hint">
        <input placeholder="Name" />
      </FgFormField>
    );

    expect(screen.getByPlaceholderText('Name')).toHaveAttribute(
      'aria-describedby',
      'name-helper'
    );
  });

  it('sets aria-describedby referencing both helper and error', () => {
    render(
      <FgFormField
        label="Name"
        htmlFor="name"
        helperText="Hint"
        error="Required"
      >
        <input placeholder="Name" />
      </FgFormField>
    );

    expect(screen.getByPlaceholderText('Name')).toHaveAttribute(
      'aria-describedby',
      'name-helper name-error'
    );
  });

  it('applies custom className to wrapper div', () => {
    const { container } = render(
      <FgFormField label="Name" className="my-custom-class">
        <input />
      </FgFormField>
    );

    expect(container.firstChild).toHaveClass('my-custom-class');
  });

  it('renders in dark mode', () => {
    document.documentElement.classList.add('dark');

    render(
      <FgFormField label="Dark field" error="Error in dark">
        <input placeholder="Dark input" />
      </FgFormField>
    );

    expect(screen.getByText('Dark field')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Dark input')).toBeInTheDocument();

    document.documentElement.classList.remove('dark');
  });
});
