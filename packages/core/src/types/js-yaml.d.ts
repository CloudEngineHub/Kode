declare module 'js-yaml' {
  const yaml: {
    JSON_SCHEMA: unknown
    load(input: string, options?: any): any
    dump(input: any, options?: any): string
  }
  export default yaml
}
