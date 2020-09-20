### Setup of https://explorer.veil-project.com/ on Ubuntu 18.04

    apt update
    apt upgrade
    apt install git python-software-properties software-properties-common nginx gcc g++ make
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.2/install.sh | bash
    nvm install 10.14.1 ## LTS release of NodeJS as of 2018-11-29, via https://nodejs.org/en/
    npm install pm2 --global
    add-apt-repository ppa:certbot/certbot
    apt update
    apt upgrade
    apt install python-certbot-nginx
    
Copy content from [./veil-block-explorer.com.conf](./veil-block-explorer.conf) into `/etc/nginx/sites-available/veil-block-explorer.com.conf`

    certbot --nginx -d explorer.veil-project.com
    cd /etc/ssl/certs
    openssl dhparam -out dhparam.pem 4096
    cd /home/veil
    git clone https://github.com/Veil-Project/Veil-Block-Explorer.git
    cd /home/veil/Veil-Block-Explorer
    npm install
    npm run build
    pm2 start bin/www --name "veil-block-explorer"
