// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inbox } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetLang } from '@/test/lang';
import { useUi } from '@/stores/ui';
import { Avatar, initialsOf } from './avatar';
import { EmptyState } from './empty-state';
import { Input } from './input';
import { LanguageToggle } from './language-toggle';
import { Menu, MenuItem, MenuSeparator } from './menu';
import { OfflineBanner } from './offline-banner';
import { PasswordInput, PasswordStrength } from './password-field';
import { Switch } from './switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import { ThemeToggle } from './theme-toggle';
import { ToastViewport } from './toast';

afterEach(() => {
  resetLang();
  act(() => { useUi.setState({ offline: false, toasts: [] }); });
});

describe('TC-FE-USER-01 Avatar', () => {
  it('TC-FE-USER-01-20 initials follow Vietnamese name order (family + given name)', () => {
    expect(initialsOf('Nguyễn Minh Anh')).toBe('NA');
    expect(initialsOf('Linh')).toBe('L');
    expect(initialsOf('   ')).toBe('?');
  });
  it('TC-FE-USER-01-21 without a picture it shows initials with an accessible name; decorative hides it', () => {
    const { rerender, container } = render(<Avatar name="Trần Linh" />);
    expect(screen.getByRole('img')).toHaveTextContent('TL');
    rerender(<Avatar name="Trần Linh" decorative />);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('TL');
  });
  it('TC-FE-USER-01-22 a broken picture falls back to initials', () => {
    const { container } = render(<Avatar name="Trần Linh" src="http://x.test/a.png" />);
    const img = container.querySelector('img')!;
    expect(img).toBeInTheDocument();
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img')).toHaveTextContent('TL');
  });
});

describe('TC-FE-UI-01 basic components', () => {
  it('TC-FE-UI-01-01 EmptyState shows title, hint and its next action', () => {
    render(<EmptyState icon={Inbox} title="Chưa có gì" action={<button>Thêm</button>}>Hãy bắt đầu</EmptyState>);
    expect(screen.getByText('Chưa có gì')).toBeInTheDocument();
    expect(screen.getByText('Hãy bắt đầu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeInTheDocument();
  });
  it('TC-FE-UI-01-02 Input marks itself invalid and renders leading/trailing adornments', () => {
    render(<Input aria-label="Tên" invalid leading={<span>L</span>} trailing={<span>đ</span>} />);
    const el = screen.getByRole('textbox', { name: 'Tên' });
    expect(el).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('đ')).toBeInTheDocument();
  });
  it('TC-FE-UI-01-03 Switch is a real switch: toggles with click and respects disabled', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Switch checked={false} onChange={onChange} label="Email" />);
    const sw = screen.getByRole('switch', { name: 'Email' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<Switch checked onChange={onChange} label="Email" disabled />);
    expect(screen.getByRole('switch', { name: 'Email' })).toBeDisabled();
  });
  it('TC-FE-UI-01-04 OfflineBanner appears only while offline', () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => { useUi.setState({ offline: true }); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('TC-FE-USER-01 settings toggles', () => {
  it('TC-FE-USER-01-23 ThemeToggle selects dark and the store follows', async () => {
    render(<ThemeToggle />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    await userEvent.click(radios[1]);
    expect(useUi.getState().theme).toBe('dark');
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
  });
  it('TC-FE-USER-01-24 LanguageToggle switches to English and back, compact shows VI/EN', async () => {
    render(<LanguageToggle compact />);
    await userEvent.click(screen.getByRole('radio', { name: 'EN' }));
    expect(useUi.getState().language).toBe('en');
    await userEvent.click(screen.getByRole('radio', { name: 'VI' }));
    expect(useUi.getState().language).toBe('vi');
  });
});

describe('TC-FE-AUTH-01 password field', () => {
  it('TC-FE-AUTH-01-20 the eye button toggles visibility and announces its state', async () => {
    render(<PasswordInput aria-label="Mật khẩu" />);
    const input = screen.getByLabelText('Mật khẩu');
    expect(input).toHaveAttribute('type', 'password');
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(btn);
    expect(input).toHaveAttribute('type', 'text');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });
  it('TC-FE-AUTH-01-21 strength meter shows a word and a met/unmet checklist (never colour only)', () => {
    const { rerender, container } = render(<PasswordStrength value="" />);
    expect(container.querySelectorAll('li')).toHaveLength(4);
    const weakText = container.textContent;
    rerender(<PasswordStrength value="Abcdef123456!" />);
    expect(container.textContent).not.toBe(weakText);
    expect(container.querySelectorAll('li .sr-only')).toHaveLength(4);
  });
});

describe('TC-FE-UI-02 menu, tabs and toast', () => {
  it('TC-FE-UI-02-01 Menu opens with the keyboard, arrows move, Escape closes and returns focus', async () => {
    const onSelect = vi.fn();
    render(<Menu label="Tài khoản" trigger={<span>NM</span>}><MenuItem onSelect={onSelect}>Một</MenuItem><MenuSeparator /><MenuItem onSelect={() => undefined} danger>Hai</MenuItem></Menu>);
    const trigger = screen.getByRole('button', { name: 'Tài khoản' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(items[1]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(items[0]).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(items[1]).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(items[0]).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });
  it('TC-FE-UI-02-02 selecting a menu item runs it and closes the menu; an outside click closes too', async () => {
    const onSelect = vi.fn();
    render(<div><Menu label="Tài khoản" trigger={<span>NM</span>}><MenuItem onSelect={onSelect}>Một</MenuItem></Menu><p>outside</p></div>);
    await userEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Một' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.click(screen.getByText('outside'));
    expect(screen.queryByRole('menu')).toBeNull();
  });
  it('TC-FE-UI-02-03 Tabs switch panels and drop aria-controls when no panel exists', async () => {
    render(
      <Tabs defaultValue="a">
        <TabsList variant="segmented"><TabsTrigger value="a">A</TabsTrigger><TabsTrigger value="b">B</TabsTrigger><TabsTrigger value="c">C</TabsTrigger></TabsList>
        <TabsContent value="a">panel a</TabsContent>
        <TabsContent value="b">panel b</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText('panel a')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'B' }));
    expect(screen.getByText('panel b')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'C' })).not.toHaveAttribute('aria-controls');
  });
  it('TC-FE-UI-02-04 toasts: errors are alerts, others are status; the action runs then dismisses; the X dismisses', async () => {
    const onClick = vi.fn();
    act(() => {
      useUi.setState({
        toasts: [
          { id: '1', kind: 'error', title: 'Lỗi' },
          { id: '2', kind: 'success', title: 'Xong', description: 'Đã lưu', action: { label: 'Hoàn tác', onClick } },
          { id: '3', kind: 'info', title: 'Tin' },
          { id: '4', kind: 'warning', title: 'Sắp hết' },
        ],
      });
    });
    render(<ToastViewport />);
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getByText('Đã lưu')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(useUi.getState().toasts.find((x) => x.id === '2')).toBeUndefined();
    await userEvent.click(screen.getAllByRole('button')[0]);
    expect(useUi.getState().toasts.length).toBeLessThan(3);
  });
});
