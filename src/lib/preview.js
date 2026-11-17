import crypto from 'crypto'
import path   from 'path'
import fs     from 'fs-extra'

const engines = [ require('./preview/image'), require('./preview/ffmpeg'), require('./preview/unoconv') ]

const cacheName = file => crypto.createHash('sha256').update(file.fullpath).digest('hex')

module.exports = (files, cache_path) => {

  const metadata = async file =>
    Object.assign({}, ...await Promise.all(
      engines.map(p => p.metadata && p.detect(file) && p.metadata(file) || {})))

  const preview = async file => {
    const p = engines.find(p => p.preview && p.detect(file))
    if (p) {
      const dest = path.join(cache_path, cacheName(file)) + '.' + p.ext(file)
      if (!await fs.pathExists(dest)) await p.preview(file.fullpath, dest)
      return path.resolve(dest)
    }
  }

  const handler = async (file, res) => {
    const { fullpath } = file
    try {
      const preview_path = await (_gen[fullpath] = _gen[fullpath] || preview(file))
      preview_path ? res.sendFile(preview_path) : res.sendStatus(405)
    } catch (err) {
      console.error('Error generating preview for %s:', fullpath, err.message)
      res.status(500).send('Preview generation failed')
    } finally {
      delete _gen[fullpath]
    }
  }
  const _gen = {}

  return { handler, metadata }
}
