import React, { useEffect, useRef } from 'react';
import { Flower2, Grid2X2, MousePointer2, Move, RotateCw, Split, X } from 'lucide-react';

interface TutorialModalProps {
  onClose: () => void;
}

export function TutorialModal({ onClose }: TutorialModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const dialog = closeRef.current?.closest('[role="dialog"]');
      const focusable = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="mm-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="mm-manual" role="dialog" aria-modal="true" aria-labelledby="mm-manual-title">
        <header className="mm-manual-header">
          <div>
            <p className="mm-kicker">观月手册</p>
            <h2 id="mm-manual-title">让每一束光都有归处</h2>
          </div>
          <button ref={closeRef} type="button" className="mm-icon-button" onClick={onClose} aria-label="关闭手册" title="关闭手册">
            <X size={19} />
          </button>
        </header>

        <div className="mm-manual-grid">
          <article>
            <MousePointer2 size={20} />
            <h3>先选镜，再决定动作</h3>
            <p>点选银镜后，可以旋转九十度或进入移动模式。鼠标悬停会预演光路；触屏首次轻点预演，再次轻点或按确认执行。</p>
          </article>
          <article>
            <RotateCw size={20} />
            <h3>两种镜面</h3>
            <p>斜线方向决定反射去向。选中银镜后使用「旋转」，每次操作消耗一步；撤销不消耗步数。</p>
          </article>
          <article>
            <Move size={20} />
            <h3>逐格移位</h3>
            <p>带虚线底座的银镜可以移到相邻空格。石台、花铃、光源、月环与其他镜面都不能被占用。</p>
          </article>
          <article>
            <Split size={20} />
            <h3>分光与跃迁</h3>
            <p>三角晶簇把来光分成左右两束。光束进入月环后，会从另一枚月环按原方向继续传播。</p>
          </article>
          <article>
            <Flower2 size={20} />
            <h3>花色就是光色</h3>
            <p>花铃只接受与自身相同颜色的光。复合色花铃需要多束光共同抵达，缺少任何一种颜色都不会开放。</p>
          </article>
          <article>
            <Grid2X2 size={20} />
            <h3>步数与难度</h3>
            <p>三星对应最优步数。轻松模式步数宽裕且有三次提示，标准模式有一次提示，宗师模式只给最优步数。</p>
          </article>
        </div>

        <footer className="mm-manual-footer">
          <span>键盘：方向键移动焦点，回车选择，R 旋转，M 移动，Ctrl / ⌘ + Z 撤销，Esc 暂停。</span>
          <button type="button" className="mm-primary-button" onClick={onClose}>回到夜庭</button>
        </footer>
      </section>
    </div>
  );
}
