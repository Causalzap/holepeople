const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;
const favicon = require('serve-favicon');   // ← 必须有


// 假设 favicon.ico 在项目根目录
app.use(favicon(path.join(process.cwd(), 'favicon.ico')));

// 提供静态文件
app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html', 'htm']
}));

// 提供 components 目录下的文件
app.use('/components', express.static(path.join(__dirname, 'components')));

// 显式路由处理
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/privacy.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'privacy.html'));
});

app.get('/terms.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'terms.html'));
});

// 处理 /level.html?n=xxx 格式的请求
app.get('/level.html', (req, res) => {
  const levelNumber = req.query.n;
  
  if (!levelNumber || isNaN(levelNumber)) {
    return res.status(400).send('Invalid level number');
  }

  // 读取关卡详情模板
  const tplPath = path.join(__dirname, 'components', 'level', '[slug].html');
  
  fs.readFile(tplPath, 'utf8', (err, tpl) => {
    if (err) {
      return res.status(500).send('Template not found');
    }

    // 替换模板中的占位符
    const levelContent = tpl.replace(/\{\{\s*slug\s*\}\}/g, levelNumber);
    
    // 读取 header 和 footer 文件
    fs.readFile(path.join(__dirname, 'components', 'header.html'), 'utf8', (err, headerContent) => {
      if (err) {
        return res.status(500).send('Header not found');
      }

      fs.readFile(path.join(__dirname, 'components', 'footer.html'), 'utf8', (err, footerContent) => {
        if (err) {
          return res.status(500).send('Footer not found');
        }

        // 读取 levels.html 作为基础模板
        fs.readFile(path.join(__dirname, 'levels.html'), 'utf8', (err, levelsHtml) => {
          if (err) {
            return res.status(500).send('Levels template not found');
          }

          // 替换 levels.html 中的内容为关卡详情
          const fullHtml = levelsHtml
            .replace('<title>Hole People - Level Guides</title>', `<title>Level ${levelNumber} · Hole People</title>`)
            .replace('<!-- Level Guides 页面分区（由 main.js 注入具体组件） -->', headerContent + levelContent + footerContent)
            .replace('scripts/main.js', '/scripts/main.js'); // 确保脚本路径正确

          res.send(fullHtml);
        });
      });
    });
  });
});

// 启动服务器
app.listen(port, () => {
  console.log(`Hole People 攻略网站运行在 http://localhost:${port}`);
  console.log('按 Ctrl+C 停止服务器');
});
