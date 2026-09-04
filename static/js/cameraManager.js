// Live Camera Capture Manager (WebRTC)
export class CameraManager {
  constructor(options = {}) {
    this.onPhotoCaptured = options.onWhiteOrPhotoCaptured || options.onPhotoCaptured || (() => {});
    this.videoElement = document.getElementById('cameraVideoFeed');
    this.canvasElement = document.getElementById('cameraCaptureCanvas');
    this.deviceSelect = document.getElementById('cameraDeviceSelect');
    this.modal = document.getElementById('cameraCaptureModal');
    this.stream = null;
    this.currentDeviceId = '';
    this.initListeners();
  }

  initListeners() {
    const btnOpen = document.getElementById('btnOpenCamera');
    const btnClose = document.getElementById('btnCloseCameraModal');
    const btnSnap = document.getElementById('btnSnapPhoto');
    if (btnOpen) btnOpen.addEventListener('click', () => this.openModal());
    if (btnClose) btnClose.addEventListener('click', () => this.closeModal());
    if (btnSnap) btnSnap.addEventListener('click', () => this.snapPhoto());
    if (this.deviceSelect) {
      this.deviceSelect.addEventListener('change', (e) => {
        this.currentDeviceId = e.target.value;
        this.startCamera(this.currentDeviceId);
      });
    }
  }

  async openModal() {
    if (this.modal) this.modal.classList.remove('hidden');
    await this.populateDevices();
    await this.startCamera(this.currentDeviceId);
  }

  closeModal() {
    this.stopCamera();
    if (this.modal) this.modal.classList.add('hidden');
  }
€…Íå¹ŒÁ½ÁÕ±…Ñ••Ù¥•Ì ¤ì(€€€ÑÉäì(€€€€€½¹ÍÐ‘•Ù¥•Ì€ô…Ý…¥Ð¹…Ù¥…Ñ½È¹µ•‘¥…•Ù¥•Ì¹•¹Õµ•É…Ñ••Ù¥•Ì ¤ì(€€€€€½¹ÍÐÙ¥‘•½•Ù¥•Ì€ô‘•Ù¥•Ì¹™¥±Ñ•È¡€ôø¹­¥¹€ôôô€Ù¥‘•½¥¹ÁÕÐœ¤ì(€€€€€Ñ¡¥Ì¹‘•Ù¥•M•±•Ð¹¥¹¹•É!Q50€ô€œœì(€€€€€¥˜€¡Ù¥‘•½•Ù¥•Ì¹±•¹Ñ €ôôô€À¤ì(€€€€€€€Ñ¡¥Ì¹‘•Ù¥•M•±•Ð¹¥¹¹•É!Q50€ô€œñ½ÁÑ¥½¸Ù…±Õ”ôˆˆù…µ…É„¹¼‘•Ñ•Ñ…‘„ð½½ÁÑ¥½¸øœì(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô(€€€€€Ù¥‘•½•Ù¥•Ì¹™½É…  ¡‘•Ø°¥‘à¤€ôøì(€€€€€€€½¹ÍÐ½ÁÐ€ô‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ½ÁÑ¥½¸œ¤ì(€€€€€€€½ÁÐ¹Ù…±Õ”€ô‘•Ø¹‘•Ù¥•%ì(€€€€€€€½ÁÐ¹Ñ•áÑ½¹Ñ•¹Ð€ô‘•Ø¹±…‰•°ñð€¡…µ…É„€‘í¥‘à€¬€Åõ€¤ì(€€€€€€€Ñ¡¥Ì¹‘•Ù¥•M•±•Ð¹…ÁÁ•¹‘¡¥±¡½ÁÐ¤ì(€€€€€ô¤ì(€€€€€¥˜€ …Ñ¡¥Ì¹ÕÉÉ•¹Ñ•Ù¥•%€˜˜Ù¥‘•½•Ù¥•Ì¹±•¹Ñ €ø€À¤ì(€€€€€€€Ñ¡¥Ì¹ÕÉÉ•¹Ñ•Ù¥•%€ôÙ¥‘•½•Ù¥•ÍlÁt¹‘•Ù¥•%ì(€€€€€ô(€€€ô…Ñ €¡•ÉÈ¤ì(€€€€€½¹Í½±”¹Ý…É¸ ÉÉ½È±¥ÍÑ…¹‘¼…µ…É…Ìèœ°•ÉÈ¤ì(€€€ô(€ô("7–æ27F'D6ÖW&†FWf–6T–BÒrr’°¢F†—2ç7F÷6ÖW&‚“°¢6öç7B6öç7G&–çG2Ò°¢f–FVó¢FWf–6T–Bò²FWf–6T–C¢²W†7C¢FWf–6T–BÒÒ¢²f6–ætÖöFS¢vVçf—&öæÖVçBrÐ¢Ó°¢G'’°¢F†—2ç7G&VÒÒv—Bæf–vF÷"æÖVF–FWf–6W2ævWEW6W$ÖVF–†6öç7G&–çG2“°¢F†—2çf–FVôVÆVÖVçBç7&4ö&¦V7BÒF†—2ç7G&VÓ°¢v—BF†—2çf–FVôVÆVÖVçBçÆ’‚“°¢Ò6F6‚†W'"’°¢G'’°¢F†—2ç7G&VÒÒv—Bæf–vF÷"æÖVF–FWf–6W2ævWEW6W$ÖVF–‡²f–FVó¢G'VRÒ“°¢F†—2çf–FVôVÆVÖVçBç7&4ö&¦V7BÒF†—2ç7G&VÓ°¢v—BF†—2çf–FVôVÆVÖVçBçÆ’‚“°¢Ò6F6‚†R’°¢6öç6öÆRçv&â‚tæò6RVFò66VFW"Æ6Ö&r“°¢Ð¢Ð¢Ð ¢7F÷6ÖW&‚’°¢–b‡F†—2ç7G&VÒ’°¢F†—2ç7G&VÒævWEG&6·2‚’æf÷$V6‚‡BÓâBç7F÷‚’“°¢F†—2ç7G&VÒÒçVÆÃ°¢Ð¢–b‡F†—2çf–FVôVÆVÖVçB’°¢F†—2çf–FVôVÆVÖVçBç7&4ö&¦V7BÒçVÆÃ°¢Ð¢Ð ¢6æ†÷Fò‚’°¢–b‚F†—2çf–FVôVÆVÖVçBÇÂF†—2ç7G&VÒ’&WGW&ã°¢6öç7Bf–FVòÒF†—2çf–FVôVÆVÖVçC°¢6öç7B6çf2ÒF†—2æ6çf4VÆVÖVçC°¢6çf2çv–GF‚Òf–FVòçf–FVõv–GF‚ÇÂ#ƒ°¢6çf2æ†V–v‡BÒf–FVòçf–FVô†V–v‡BÇÂs#°¢6öç7B7G‚Ò6çf2ævWD6öçFW‡B‚s&Br“°¢7G‚æG&t–ÖvR‡f–FVòÂÂÂ6çf2çv–GF‚Â6çf2æ†V–v‡B“°¢6öç7B#cBÒ6çf2çFôFFU$Â‚v–ÖvRö§VrrÂã“"“°¢F†—2æöå†÷Fô6GW&VB‡°¢–ÖvT&6ScC¢#cBÀ¢6÷W&6S¢v6ÖW&rÀ¢F—FÆS¢tf÷FòFR6Ö&òçFÆÆp¢Ò“°¢F†—2æ6Æ÷6TÖöFÂ‚“°¢Ð§Ð 