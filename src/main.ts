import { BreakoutGame } from './game';

const game = new BreakoutGame();

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

const sideMenu = byId('sideMenu');
const exitConfirmPopup = byId('exitConfirmPopup');
const blockingPopupIds = ['usernamePopup', 'levelStartPopup', 'gamePopup', 'levelSelectScreen', 'exitConfirmPopup'];

const isOpen = (element: HTMLElement | null) => element?.classList.contains('show') ?? false;

function openMenu(): void {
    if (!sideMenu) return;
    sideMenu.classList.add('show');
    game.pause();
}

function closeMenu(): void {
    if (!sideMenu) return;
    sideMenu.classList.remove('show');
    game.resume();
}

function setupMenu(): void {
    byId('menuBtn')?.addEventListener('click', () => (isOpen(sideMenu) ? closeMenu() : openMenu()));
    byId('closeMenuIcon')?.addEventListener('click', closeMenu);
    byId('resumeBtn')?.addEventListener('click', closeMenu);

    sideMenu?.addEventListener('click', e => {
        if (e.target === sideMenu) closeMenu();
    });
}

function setupExitFlow(): void {
    byId('exitBtn')?.addEventListener('click', e => {
        e.stopPropagation();
        game.pause();
        exitConfirmPopup?.classList.add('show');
    });

    byId('exitConfirmYesBtn')?.addEventListener('click', () => {
        exitConfirmPopup?.classList.remove('show');
        sideMenu?.classList.remove('show');
        game.returnToTitle();
    });

    byId('exitConfirmNoBtn')?.addEventListener('click', () => {
        exitConfirmPopup?.classList.remove('show');
        if (!isOpen(sideMenu)) game.resume();
    });
}

function bindToggle(id: string, initial: boolean, onChange: (checked: boolean) => void): void {
    const toggle = byId<HTMLInputElement>(id);
    if (!toggle) return;
    toggle.checked = initial;
    toggle.addEventListener('change', () => {
        game.playUiSound();
        onChange(toggle.checked);
    });
}

function setupSettings(): void {
    bindToggle('musicToggle', game.musicEnabled, checked => game.toggleMusic(checked));
    bindToggle('soundToggle', game.soundEnabled, checked => game.toggleSound(checked));
    bindToggle('bgToggle', game.backgroundType === 'night', checked => game.setBackground(checked ? 'night' : 'morning'));
}

function setupLevelSelect(): void {
    byId('levelSelectBtn')?.addEventListener('click', () => game.openLevelSelect());
    byId('closeLevelSelectIcon')?.addEventListener('click', () => game.closeLevelSelect());
}

function setupShortcuts(): void {
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape' && e.key.toLowerCase() !== 'p') return;
        if (e.target instanceof HTMLInputElement) return;

        if (isOpen(sideMenu)) {
            closeMenu();
            return;
        }

        const blocked = blockingPopupIds.some(id => isOpen(byId(id)));
        if (!blocked && game.state === 'playing') {
            openMenu();
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && game.state === 'playing') {
            openMenu();
        }
    });
}

function setupUiSounds(): void {
    document.addEventListener('click', e => {
        if ((e.target as HTMLElement).closest('button:not(:disabled)')) {
            game.playUiSound();
        }
    });
}

setupMenu();
setupExitFlow();
setupSettings();
setupLevelSelect();
setupShortcuts();
setupUiSounds();

game.start().catch(err => console.error('Failed to start game:', err));
