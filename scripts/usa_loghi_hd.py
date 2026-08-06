#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sostituisce i loghi attuali con le versioni HD (assets/img/HD/) rifatte da te.
Copia mantenendo gli stessi nomi, cosi' il sito li usa senza toccare il codice.

  HD/dead HD.png      -> dead.png
  HD/people HD.png    -> people.png
  HD/activity HD.png  -> activity.png
  HD/logo-dpa HD.png  -> logo-dpa.png

USO:  python usa_loghi_hd.py   (o doppio click su usa_loghi_hd.bat)
"""
import os, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.normpath(os.path.join(HERE, "..", "assets", "img"))
HD = os.path.join(IMG, "HD")

MAP = {
    "dead HD.png":     "dead.png",
    "people HD.png":   "people.png",
    "activity HD.png": "activity.png",
    "logo-dpa HD.png": "logo-dpa.png",
}

def main():
    for src, dst in MAP.items():
        s = os.path.join(HD, src)
        d = os.path.join(IMG, dst)
        if not os.path.exists(s):
            print("  ! Manca:", s); continue
        shutil.copyfile(s, d)
        print("  OK", dst, "(", os.path.getsize(d)//1024, "KB )")
    print("FATTO. Ricarica il sito (Ctrl+F5).")

if __name__ == "__main__":
    main()
