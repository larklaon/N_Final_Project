"""App icon, adaptive icon, themed icon, splash mark and favicon: the gap cut into four
pieces that grow clearer to the right (E1). Run from the repo root: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw
INK=(18,21,19); BAND=(232,240,234); END=(120,222,182)
SS=4
def ramp(n): return [tuple(int(BAND[k]+(END[k]-BAND[k])*i/(n-1)) for k in range(3)) for i in range(n)]
COLS=ramp(4)
def draw(size, bg, cols, scale=1.0, alphas=None):
    """Four slanted pieces, E1. Geometry is defined on a 432-unit canvas (108dp adaptive icon)."""
    W=size*SS; u=W/432*scale
    im=Image.new('RGBA',(W,W),bg); d=ImageDraw.Draw(im)
    cx=cy=W/2; h=92*u; rise=34*u; span=104*u; gap=7*u
    x0,x1=cx-span,cx+span; n=4; step=(x1-x0)/n
    top=lambda x: cy-h/2-rise*(x-cx)/(x1-x0)
    for i in range(n):
        l=x0+i*step+(gap/2 if i else 0); r=x0+(i+1)*step-(gap/2 if i<n-1 else 0)
        col=cols[i] if alphas is None else (255,255,255,int(255*alphas[i]))
        d.polygon([(l,top(l)),(r,top(r)),(r,top(r)+h),(l,top(l)+h)],fill=col)
    return im.resize((size,size),Image.LANCZOS)
A='assets/'
draw(1024,INK+(255,),COLS,scale=1.5).convert('RGB').save(A+'icon.png')                       # store icon, full bleed
draw(1024,(0,0,0,0),COLS).save(A+'android-icon-foreground.png')                    # adaptive foreground
draw(1024,(0,0,0,0),None,alphas=[0.45,0.65,0.85,1]).save(A+'android-icon-monochrome.png')  # themed icon
draw(1024,(0,0,0,0),COLS,scale=1.9).save(A+'splash-icon.png')                     # splash mark, fills the image
draw(48,INK+(255,),COLS,scale=1.3).convert('RGB').save(A+'favicon.png')
