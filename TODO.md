????
  // Attach assistant to req and res
  if (ref.req && ref.res) {
    ref.req.assistant = self;
    ref.res.assistant = self;
  }

    console.log('*** err', err);
    console.log('*** req.assistant', req.assistant);
    console.log('*** res.assistant', res.assistant);
