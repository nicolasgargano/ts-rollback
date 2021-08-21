export type NetworkStats = {
  // The length of the queue containing UDP packets which have not yet been acknowledged by the end client.
  // The length of the send queue is a rough indication of the quality of the connection. The longer the send queue, the higher the round-trip time between the
  // clients. The send queue will also be longer than usual during high packet loss situations.
  sendQueueLength: number
  // The roundtrip packet transmission time as calcuated by GGRS.
  ping: number
  // The estimated bandwidth used between the two clients, in kilobits per second.
  kbpsSent: number
  // The number of frames GGRS calculates that the local client is behind the remote client at this instant in time.
  // For example, if at this instant the current game client is running frame 1002 and the remote game client is running frame 1009,
  // this value will mostly likely roughly equal 7.
  localFrameAdvantage: number
  /// The same as `local_frames_behind`, but calculated from the perspective of the remote player.
  remoteFrameAdvantage: number
}
