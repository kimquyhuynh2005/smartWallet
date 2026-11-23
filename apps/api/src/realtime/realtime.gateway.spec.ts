import { JwtService } from '@nestjs/jwt';
import { UID, mockPrisma } from '../testing/mocks';
import { RealtimeGateway, userRoom } from './realtime.gateway';

const jwt = new JwtService({ secret: 'ws-secret', signOptions: { expiresIn: '15m' } });

function setup() {
  const prisma = mockPrisma(['user']);
  const gw = new RealtimeGateway(jwt, prisma);
  let middleware!: (socket: any, next: (e?: Error) => void) => Promise<void>;
  gw.afterInit({ use: (fn: any) => { middleware = fn; } } as any);
  const connect = async (handshake: any) => {
    const socket: any = { handshake, data: {}, join: jest.fn() };
    const next = jest.fn();
    await middleware(socket, next);
    return { socket, next };
  };
  return { gw, prisma, connect };
}
const tokenFor = (sub: string) => jwt.sign({ sub });

describe('ALR-02 Socket.IO gateway (namespace /ws)', () => {
  it('accepts a valid JWT from handshake.auth.token and joins room user:{id}', async () => {
    const { gw, prisma, connect } = setup();
    prisma.user.findFirst.mockResolvedValue({ id: UID(1), status: 'ACTIVE' });
    const { socket, next } = await connect({ auth: { token: tokenFor(UID(1)) }, headers: {} });
    expect(next).toHaveBeenCalledWith(); // no error
    expect(socket.data.userId).toBe(UID(1));
    gw.handleConnection(socket);
    expect(socket.join).toHaveBeenCalledWith(`user:${UID(1)}`);
    expect(userRoom(UID(1))).toBe(`user:${UID(1)}`);
  });
  it('also accepts an Authorization: Bearer header', async () => {
    const { prisma, connect } = setup();
    prisma.user.findFirst.mockResolvedValue({ id: UID(1), status: 'ACTIVE' });
    const { next } = await connect({ auth: {}, headers: { authorization: `Bearer ${tokenFor(UID(1))}` } });
    expect(next).toHaveBeenCalledWith();
  });
  it('rejects missing, garbage, wrongly signed and expired tokens with "unauthorized"', async () => {
    const { connect, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue({ id: UID(1), status: 'ACTIVE' });
    const other = new JwtService({ secret: 'someone-else' });
    const expired = jwt.sign({ sub: UID(1) }, { expiresIn: -10 });
    for (const auth of [{}, { token: 'garbage' }, { token: other.sign({ sub: UID(1) }) }, { token: expired }]) {
      const { next, socket } = await connect({ auth, headers: {} });
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'unauthorized' }));
      expect(socket.data.userId).toBeUndefined();
    }
  });
  it('rejects deleted or locked users even with a valid token (same rule as the HTTP guard)', async () => {
    const { connect, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(null);
    expect((await connect({ auth: { token: tokenFor(UID(1)) }, headers: {} })).next).toHaveBeenCalledWith(expect.objectContaining({ message: 'unauthorized' }));
    prisma.user.findFirst.mockResolvedValue({ id: UID(1), status: 'LOCKED' });
    expect((await connect({ auth: { token: tokenFor(UID(1)) }, headers: {} })).next).toHaveBeenCalledWith(expect.objectContaining({ message: 'unauthorized' }));
  });
  it('never joins a room for a socket that failed authentication', () => {
    const { gw } = setup();
    const socket: any = { data: {}, join: jest.fn() };
    gw.handleConnection(socket);
    expect(socket.join).not.toHaveBeenCalled();
  });
  it('emit sends to the user\'s room only, and a broken socket layer never throws', () => {
    const { gw } = setup();
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    (gw as any).server = { to };
    gw.emit(UID(1), 'notification:new', { a: 1 });
    expect(to).toHaveBeenCalledWith(`user:${UID(1)}`);
    expect(emit).toHaveBeenCalledWith('notification:new', { a: 1 });
    (gw as any).server = { to: () => { throw new Error('closed'); } };
    expect(() => gw.emit(UID(1), 'x', {})).not.toThrow();
    (gw as any).server = undefined;
    expect(() => gw.emit(UID(1), 'x', {})).not.toThrow();
  });
});
