// Panonun RemNote ana sayfasında ihtiyaç duyduğu CSS (SDK'nın resmî registerCSS yolu).
// Her kural yalnız pano iframe'ini içeren öğelerin içinde geçerlidir; belgenin geri kalanına,
// başka widget'lara ve RemNote'un diğer ağaçlarına dokunmaz.

const SCOPE = 'div.fade-in-first-load:has(> div > iframe[src*="widgetName=eisenhower_board"])';

// 1) Genişlik: yalnız panoyu belge sütunundan taşırıp bölme genişliğine yayar (Wide Layout
//    açmadan). Belge sarmalayıcısı (bölme genişliğinde) ölçüm kabı olur; pano 32 px kenar
//    boşluğuyla genişler. Belgenin solundaki 48 px madde imi boşluğu (ölçüldü: belge 848 px,
//    içerik 800 px) ortalamada hesaba katılır. Bölme 912 px'ten darsa hiçbir şey değişmez.
// 2) Açılan alt ağaç (RemHierarchyEditorTree) boşlukları: RemNote ağacın üstüne 32 px'lik
//    "üste satır ekle", altına 30 px'lik "satır ekle" ve 50 px'lik bir dolgu satırı koyuyor
//    (ölçüldü; satırlar JS ile mutlak konumlu). İç kap üstten 32, alttan 80 px kırpılır ve
//    taşan bu üç satır gizlenip tıklamaya kapatılır (yoksa panonun satırlarının üstüne biner).
export const WIDE_CSS_ID = 'eisenhower-board-wide';
export const WIDE_CSS = `
.rn-document-wrapper:has(iframe[src*="widgetName=eisenhower_board"]){container-type:inline-size;container-name:eh-doc}
@container eh-doc (min-width: 912px){
  ${SCOPE}{
    --eh-w:min(calc(100cqw - 64px),1800px);
    width:var(--eh-w);
    margin-left:calc((100% - var(--eh-w) - 48px) / 2);
  }
}
${SCOPE} .HierarchyEditorChildrenList > .pl-0.relative{margin-top:-32px;margin-bottom:-80px}
${SCOPE} .HierarchyEditorChildrenList .rn-editor-container:has(> .tree-node--parent > .rn-add-rem-button--top),
${SCOPE} .HierarchyEditorChildrenList .rn-editor-container:has(> .tree-node--parent > .rn-add-rem-button--bottom),
${SCOPE} .HierarchyEditorChildrenList .rn-editor-container[style*="min-height: 50px"]:not(:has(.rem)):not(:has(.rn-add-rem-button)){visibility:hidden;pointer-events:none}`;
