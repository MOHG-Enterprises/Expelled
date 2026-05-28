import socketIo from 'socket.io-client';
export { socketIo as io };
export type Socket = ReturnType<typeof socketIo>;
