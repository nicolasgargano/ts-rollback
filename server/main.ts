const { PeerServer } = require("peer")

export const peerServer = PeerServer({ port: 9000, path: "/peer" })
