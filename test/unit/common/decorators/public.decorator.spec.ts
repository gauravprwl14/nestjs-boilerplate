import 'reflect-metadata';
import { Public } from '@common/decorators/public.decorator';
import { IS_PUBLIC_KEY } from '@common/constants';

/**
 * @Public() is a thin SetMetadata wrapper. We verify the observable contract
 * — that the IS_PUBLIC_KEY metadata flag is set to `true` on decorated members.
 */
describe('Public decorator', () => {
  it('sets IS_PUBLIC_KEY metadata to true on a method', () => {
    // --- ARRANGE ---
    class Ctl {
      @Public()
      health(): void {}
    }

    // --- ACT ---
    const value = Reflect.getMetadata(IS_PUBLIC_KEY, Ctl.prototype.health);

    // --- ASSERT ---
    expect(value).toBe(true);
  });

  it('sets IS_PUBLIC_KEY metadata to true on a class', () => {
    // --- ARRANGE ---
    @Public()
    class OpenCtl {}

    // --- ACT ---
    const value = Reflect.getMetadata(IS_PUBLIC_KEY, OpenCtl);

    // --- ASSERT ---
    expect(value).toBe(true);
  });

  it('leaves undecorated methods without the IS_PUBLIC_KEY flag', () => {
    // --- ARRANGE ---
    class Ctl {
      unprotected(): void {}
    }

    // --- ACT ---
    const value = Reflect.getMetadata(IS_PUBLIC_KEY, Ctl.prototype.unprotected);

    // --- ASSERT ---
    expect(value).toBeUndefined();
  });
});
