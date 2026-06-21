declare module 'react-reconciler' {
  const reconciler: {
    batchedUpdates?: (fn: () => void) => void
  }

  export default reconciler
}
