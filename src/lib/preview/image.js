import fs from 'fs-extra'
import gm from 'gm'

let Canvas = null, Image = null
try {
  const canvasPkg = require('canvas')
  Canvas = canvasPkg.Canvas
  Image = canvasPkg.Image
} catch (e) {
  // canvas native binding not available, graceful fallback to gm
}

exports.detect = ({ mime }) => /^image\//.test(mime)

exports.metadata = file => ({ media_type: 'image' })

exports.ext = file => 'png'

exports.preview = async (src, dest) => {
  if (Canvas && Image) {
    try {
      const buf = await pixelateCanvas(src)
      return await fs.writeFile(dest, buf)
    } catch (err) {
      console.warn('Canvas rendering error, falling back to gm:', err.message)
    }
  }
  return await pixelateGM(src, dest)
}

const pixelateCanvas = async path => {
  // load original image
  const img  = new Image
      , buff = img.src = await fs.readFile(path)

  // make canvas for preview image
  const canvas     = new Canvas(img.width, img.height)
      , ctx        = canvas.getContext('2d')

  ctx.imageSmoothingEnabled = false
  ctx.patternQuality = 'fast'

  // resize left-half to 0.1x, then re-enlarge
  const scaledImg  = new Image
  scaledImg.src = await toBuff(gm(buff).crop(img.width/2, img.height, 0, 0).resize(Math.min(img.width*0.1, 80)), 'PNG')
  ctx.drawImage(img, 0, 0, img.width, img.height)
  ctx.drawImage(scaledImg, 0, 0, img.width/2, img.height)

  // add red separator line
  ctx.beginPath()
  ctx.lineWidth = (img.height*0.002)
  ctx.strokeStyle = 'red'
  ctx.moveTo(img.width/2-ctx.lineWidth/2, 0)
  ctx.lineTo(img.width/2-ctx.lineWidth/2, img.height)
  ctx.stroke()

  // add PREVIEW text
  ctx.font         = '' + (img.width*0.1) + 'px arial'
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.strokeStyle  = 'black'
  ctx.fillStyle    = 'white'
  ctx.fillText('PREVIEW', img.width/2, img.height/2)
  ctx.strokeText('PREVIEW', img.width/2, img.height/2)

  return toBuff(canvas)
}

const pixelateGM = async (src, dest) => {
  return new Promise((resolve, reject) => {
    gm(src).size((err, size) => {
      if (err) return reject(err)
      const w = (size && size.width) || 600
          , h = (size && size.height) || 400
          , halfW = Math.floor(w / 2)
          , fontSize = Math.max(16, Math.floor(w * 0.08))

      const font = fs.existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
        ? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
        : (fs.existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
            ? '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf' : undefined)

      let g = gm(src)
        .blur(10, 5)
        .stroke('red', Math.max(2, Math.floor(h * 0.005)))
        .drawLine(halfW, 0, halfW, h)

      if (font) g = g.font(font)
      g.fontSize(fontSize)
       .stroke('black', 2)
       .fill('white')
       .drawText(0, 0, 'PREVIEW', 'Center')
       .write(dest, e => e ? reject(e) : resolve())
    })
  })
}

const toBuff = (obj, ...a) => new Promise((resolve, reject) => {
  obj.toBuffer(...a, (err, res) => err ? reject(err) : resolve(res))
})
