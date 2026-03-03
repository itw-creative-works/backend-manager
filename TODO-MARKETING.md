1. Determine name via AI on signup
2. Add to sendgrid marketig cotacts
3. then, develop a way to SYNC them to the marketing contacts. we coould sync on payment changes (liek newly subscribed, cancelled, etc) so we can segment them??


When user sings up, use AI to generate first name, last name, company???
When user doc is updated, sync with sendgrid and beehiiv?? like name, premium status, etc
if admin is set to true from something else then we send an emergency critical email to alert us

need to confirm we hv hooks/events setup properly
      handlerPath = `${Manager.cwd}/events/${handlerName}.js`;
liek bm_cronDaily, is it able to find the BEM path right? what about if we want to add our own per project?

implement BEM hooks (removed in muddleware semantic system)

https://firebase.google.com/docs/functions/2nd-gen-upgrade

------------
You are to extract the first name, last name, and company from the provided email.

If you can get the company from the email domain, include that as well but DO NOT set the company to generic email providers like gmail, yahoo, etc.

You may use a single initial if the email does not provide a full first name.

For example:
jonsnow123@gmail.com, jon.snow123@gmail.com
First Name: Jon
Last Name: Snow
Company:

jsnow123@gmail.com, j.snow123@gmail.com
First Name: J
Last Name: Snow
Company:

jon.snow@acme.com
First Name: Jon
Last Name: Snow
Company: Acme

jsnow@acme.com
First Name: J
Last Name: Snow
Company: Acme

jon123@gmail.com
First Name: Jon
Last Name:
Company:

every time we touch, cascada
just dance, lady gaga
over drake,
Time, hans zimmer
yellow, coldplay
yess bitch,
