let ioInstance = null;
const connectedUsers = [];

export const setSocketInstance = (io) => {
  ioInstance = io;
};

export const addConnectedUser = (userId, socketId) => {
  if (!userId) return;

  const existingUser = connectedUsers.find((user) => user.userId === userId);

  if (existingUser) {
    existingUser.socketId = socketId;
    return;
  }

  connectedUsers.push({ userId, socketId });
};

export const removeConnectedUserBySocket = (socketId) => {
  const index = connectedUsers.findIndex((user) => user.socketId === socketId);
  if (index !== -1) {
    connectedUsers.splice(index, 1);
  }
};

export const emitNotificationToUser = (userId) => {
  if (!ioInstance || !userId) return;

  const recipient = connectedUsers.find((user) => user.userId === userId.toString());
  if (recipient) {
    ioInstance.to(recipient.socketId).emit("newNotification");
  }
};

export const emitMessageToUser = (userId, payload) => {
  if (!ioInstance || !userId) return;

  const recipient = connectedUsers.find((user) => user.userId === userId.toString());
  if (recipient) {
    ioInstance.to(recipient.socketId).emit("receiveMessage", payload);
  }
};
